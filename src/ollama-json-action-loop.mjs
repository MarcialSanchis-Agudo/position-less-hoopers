import {
  executeOllamaWorkspaceTool
} from "./ollama-tool-loop.mjs";

export const OLLAMA_JSON_ACTION_SCHEMA = Object.freeze({
  type: "object",
  required: ["action"],
  properties: {
    action: {
      type: "string",
      enum: [
        "read_text_file",
        "list_directory",
        "write_text_file",
        "replace_line_range",
        "replace_text_in_file",
        "run_public_tests",
        "finish"
      ]
    },
    path: { type: ["string", "null"] },
    withLineNumbers: { type: ["boolean", "null"] },
    content: { type: ["string", "null"] },
    startLine: { type: ["integer", "null"] },
    endLine: { type: ["integer", "null"] },
    newText: { type: ["string", "null"] },
    oldText: { type: ["string", "null"] },
    replaceAll: { type: ["boolean", "null"] },
    summary: { type: ["string", "null"] }
  }
});

function actionToToolCall(action) {
  const args = {};
  for (const key of [
    "path", "withLineNumbers", "content", "startLine", "endLine",
    "newText", "oldText", "replaceAll"
  ]) {
    if (action[key] !== null && action[key] !== undefined) {
      args[key] = action[key];
    }
  }
  return { function: { name: action.action, arguments: args } };
}

async function structuredChat(baseUrl, body, { timeoutMs = 120000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  let text;
  try {
    response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    // fetch resolves at headers. Keep the deadline active through body consumption.
    text = await response.text();
  } catch (error) {
    if (controller.signal.aborted) {
      const timeoutError = new Error(
        `Ollama structured-action timeout after ${timeoutMs}ms`
      );
      timeoutError.code = "OLLAMA_REQUEST_TIMEOUT";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(
      `Ollama structured-action HTTP ${response.status}: ${text.slice(0, 2000)}`
    );
  }
  const payload = JSON.parse(text);
  const content = payload?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new Error("Ollama structured-action response contained no message content");
  }
  let action;
  try {
    action = JSON.parse(content);
  } catch {
    throw new Error(
      `Ollama structured-action response was not valid JSON: ${content.slice(0, 1000)}`
    );
  }
  if (
    !action || typeof action !== "object" || Array.isArray(action) ||
    !OLLAMA_JSON_ACTION_SCHEMA.properties.action.enum.includes(action.action)
  ) {
    throw new Error("Ollama structured-action response did not match the action object shape");
  }
  return {
    action,
    thinking: typeof payload?.message?.thinking === "string"
      ? payload.message.thinking : "",
    metrics: {
      totalDuration: payload?.total_duration ?? null,
      promptEvalCount: payload?.prompt_eval_count ?? null,
      evalCount: payload?.eval_count ?? null
    }
  };
}

export async function runOllamaJsonActionAgent({
  model,
  workspace,
  prompt,
  baseUrl = "http://127.0.0.1:11434",
  maxSteps = 20,
  numCtx = 32768,
  requestTimeoutMs = 120000,
  totalTimeoutMs = 480000,
  onProgress = null
}) {
  for (const [name, value] of Object.entries({
    maxSteps, numCtx, requestTimeoutMs, totalTimeoutMs
  })) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new TypeError(`${name} must be a positive safe integer`);
    }
  }
  const messages = [
    {
      role: "system",
      content: [
        "You are a local software implementation agent.",
        "Return exactly one JSON action object per turn.",
        "Do not emit XML tool-call syntax.",
        "Do not request MCP tools.",
        "Use read_text_file with withLineNumbers=true before editing an existing implementation file.",
        "Prefer replace_line_range for existing files.",
        "write_text_file is only for creating new files.",
        "If replace_text_in_file fails once, re-read with line numbers and use replace_line_range.",
        "Run run_public_tests after coherent implementation changes.",
        "Do not modify TASK.md, contract files, state files, or test files.",
        "Do not access grader source, hidden tests, parent directories, sibling directories, or the network.",
        "When the requested work is complete, return action=finish with a concise summary."
      ].join("\n")
    },
    {
      role: "user",
      content: [
        prompt, "", "Available actions:",
        "- read_text_file(path, withLineNumbers)",
        "- list_directory(path)",
        "- write_text_file(path, content) for NEW files only",
        "- replace_line_range(path, startLine, endLine, newText)",
        "- replace_text_in_file(path, oldText, newText, replaceAll)",
        "- run_public_tests", "- finish(summary)", "",
        "Return the next action as JSON."
      ].join("\n")
    }
  ];
  const transcript = [];
  const startedMs = Date.now();
  let actionCount = 0;
  let writeActionCount = 0;
  let testActionCount = 0;
  let requestCount = 0;
  let lastRequest = null;
  let lastAction = null;
  let finalContent = "";

  async function emitProgress(extra = {}) {
    const snapshot = {
      completed: false,
      steps: actionCount,
      actionCount,
      writeActionCount,
      testActionCount,
      requestCount,
      lastRequest,
      lastAction,
      transcript: [...transcript],
      finalContent,
      ...extra
    };
    if (typeof onProgress === "function") await onProgress(snapshot);
    return snapshot;
  }

  const deadlineResult = () => emitProgress({
    failure: "agent_deadline_exhausted", phase: "deadline"
  });

  for (let step = 1; step <= maxSteps; step += 1) {
    const remainingMs = totalTimeoutMs - (Date.now() - startedMs);
    if (remainingMs <= 0) return deadlineResult();

    const timeoutMs = Math.min(requestTimeoutMs, remainingMs);
    requestCount += 1;
    lastRequest = {
      index: requestCount,
      step,
      startedAt: new Date().toISOString(),
      timeoutMs,
      status: "in_flight"
    };
    // Persist before sending, including the very first request (zero actions).
    await emitProgress({ phase: "request_started" });
    const requestStartedMs = Date.now();
    const availableMs = totalTimeoutMs - (requestStartedMs - startedMs);
    if (availableMs <= 0) {
      lastRequest = { ...lastRequest, status: "not_sent", durationMs: 0 };
      return deadlineResult();
    }
    lastRequest = { ...lastRequest, timeoutMs: Math.min(timeoutMs, availableMs) };

    let chat;
    try {
      chat = await structuredChat(baseUrl, {
        model,
        messages,
        stream: false,
        think: false,
        format: OLLAMA_JSON_ACTION_SCHEMA,
        options: { num_ctx: numCtx, temperature: 0 }
      }, { timeoutMs: lastRequest.timeoutMs });
    } catch (error) {
      const agentError = error instanceof Error ? error.message : String(error);
      lastRequest = {
        ...lastRequest,
        status: "failed",
        durationMs: Date.now() - requestStartedMs,
        error: agentError
      };
      // A failed request is a terminal runtime result, not a reset of prior actions.
      return emitProgress({
        phase: "request_failed",
        failure: Date.now() - startedMs >= totalTimeoutMs
          ? "agent_deadline_exhausted"
          : error?.code === "OLLAMA_REQUEST_TIMEOUT"
            ? "request_timeout" : "structured_request_failed",
        agentError
      });
    }
    lastRequest = {
      ...lastRequest,
      status: "completed",
      durationMs: Date.now() - requestStartedMs
    };
    const action = chat.action;
    actionCount += 1;
    lastAction = action.action;
    transcript.push({ step, action, thinking: chat.thinking, metrics: chat.metrics });
    await emitProgress({ phase: "action_selected" });
    if (Date.now() - startedMs >= totalTimeoutMs) return deadlineResult();

    messages.push({ role: "assistant", content: JSON.stringify(action) });
    if (action.action === "finish") {
      finalContent = typeof action.summary === "string" ? action.summary : "Agent finished.";
      return emitProgress({ completed: true, phase: "completed" });
    }
    if (["write_text_file", "replace_line_range", "replace_text_in_file"].includes(action.action)) {
      writeActionCount += 1;
    }
    if (action.action === "run_public_tests") testActionCount += 1;

    let result;
    try {
      result = {
        ok: true,
        result: await executeOllamaWorkspaceTool(workspace, actionToToolCall(action))
      };
    } catch (error) {
      result = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    transcript.push({ step, actionResult: result });
    await emitProgress({ phase: "action_result" });
    messages.push({
      role: "user",
      content: [
        `RESULT for ${action.action}:`, JSON.stringify(result), "",
        "Choose the next JSON action."
      ].join("\n")
    });
  }
  return emitProgress({ failure: "max_steps_exhausted", phase: "max_steps" });
}
