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
    "path",
    "withLineNumbers",
    "content",
    "startLine",
    "endLine",
    "newText",
    "oldText",
    "replaceAll"
  ]) {
    if (action[key] !== null && action[key] !== undefined) {
      args[key] = action[key];
    }
  }

  return {
    function: {
      name: action.action,
      arguments: args
    }
  };
}

async function structuredChat(
  baseUrl,
  body,
  { timeoutMs = 120000 } = {}
) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  let response;
  try {
    response = await fetch(
      `${baseUrl.replace(/\/$/, "")}/api/chat`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(body),
        signal: controller.signal
      }
    );
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        `Ollama structured-action timeout after ${timeoutMs}ms`
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Ollama structured-action HTTP ${response.status}: ${text.slice(0, 2000)}`
    );
  }

  const payload = JSON.parse(text);
  const content = payload?.message?.content;

  if (typeof content !== "string" || content.trim() === "") {
    throw new Error(
      "Ollama structured-action response contained no message content"
    );
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
    !action ||
    typeof action !== "object" ||
    Array.isArray(action) ||
    typeof action.action !== "string"
  ) {
    throw new Error(
      "Ollama structured-action response did not match the action object shape"
    );
  }

  return {
    action,
    thinking:
      typeof payload?.message?.thinking === "string"
        ? payload.message.thinking
        : "",
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
        prompt,
        "",
        "Available actions:",
        "- read_text_file(path, withLineNumbers)",
        "- list_directory(path)",
        "- write_text_file(path, content) for NEW files only",
        "- replace_line_range(path, startLine, endLine, newText)",
        "- replace_text_in_file(path, oldText, newText, replaceAll)",
        "- run_public_tests",
        "- finish(summary)",
        "",
        "Return the next action as JSON."
      ].join("\n")
    }
  ];

  const transcript = [];
  const startedMs = Date.now();
  let actionCount = 0;
  let writeActionCount = 0;
  let testActionCount = 0;
  let finalContent = "";

  async function emitProgress(extra = {}) {
    if (typeof onProgress !== "function") return;
    await onProgress({
      completed: extra.completed ?? false,
      steps: extra.steps ?? actionCount,
      actionCount,
      writeActionCount,
      testActionCount,
      transcript,
      finalContent,
      ...extra
    });
  }

  for (let step = 1; step <= maxSteps; step += 1) {
    const elapsedMs = Date.now() - startedMs;
    const remainingMs = totalTimeoutMs - elapsedMs;

    if (remainingMs <= 0) {
      await emitProgress({
        completed: false,
        steps: step - 1,
        failure: "agent_deadline_exhausted",
        phase: "deadline"
      });
      return {
        completed: false,
        steps: step - 1,
        actionCount,
        writeActionCount,
        testActionCount,
        finalContent,
        transcript,
        failure: "agent_deadline_exhausted"
      };
    }

    const chat = await structuredChat(
      baseUrl,
      {
        model,
        messages,
        stream: false,
        think: false,
        format: OLLAMA_JSON_ACTION_SCHEMA,
        options: {
          num_ctx: numCtx,
          temperature: 0
        }
      },
      {
        timeoutMs: Math.min(
          requestTimeoutMs,
          remainingMs
        )
      }
    );

    const action = chat.action;
    actionCount += 1;

    transcript.push({
      step,
      action,
      thinking: chat.thinking,
      metrics: chat.metrics
    });

    await emitProgress({
      completed: false,
      steps: step,
      phase: "action_selected",
      lastAction: action.action
    });

    messages.push({
      role: "assistant",
      content: JSON.stringify(action)
    });

    if (action.action === "finish") {
      finalContent =
        typeof action.summary === "string"
          ? action.summary
          : "Agent finished.";

      await emitProgress({
        completed: true,
        steps: step,
        phase: "completed",
        finalContent
      });

      return {
        completed: true,
        steps: step,
        actionCount,
        writeActionCount,
        testActionCount,
        finalContent,
        transcript
      };
    }

    if (
      action.action === "write_text_file" ||
      action.action === "replace_line_range" ||
      action.action === "replace_text_in_file"
    ) {
      writeActionCount += 1;
    }

    if (action.action === "run_public_tests") {
      testActionCount += 1;
    }

    let result;
    try {
      result = {
        ok: true,
        result: await executeOllamaWorkspaceTool(
          workspace,
          actionToToolCall(action)
        )
      };
    } catch (error) {
      result = {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : String(error)
      };
    }

    transcript.push({
      step,
      actionResult: result
    });

    await emitProgress({
      completed: false,
      steps: step,
      phase: "action_result",
      lastAction: action.action
    });

    messages.push({
      role: "user",
      content: [
        `RESULT for ${action.action}:`,
        JSON.stringify(result),
        "",
        "Choose the next JSON action."
      ].join("\n")
    });
  }

  await emitProgress({
    completed: false,
    steps: maxSteps,
    failure: "max_steps_exhausted",
    phase: "max_steps"
  });

  return {
    completed: false,
    steps: maxSteps,
    actionCount,
    writeActionCount,
    testActionCount,
    finalContent,
    transcript,
    failure: "max_steps_exhausted"
  };
}
