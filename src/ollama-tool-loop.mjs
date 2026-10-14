import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const MAX_FILE_BYTES = 200000;

function inside(workspace, relativePath) {
  if (typeof relativePath !== "string" || relativePath.trim() === "") {
    throw new TypeError("path must be a non-empty string");
  }
  if (path.isAbsolute(relativePath)) {
    throw new Error("absolute paths are not allowed");
  }
  const resolved = path.resolve(workspace, relativePath);
  const relative = path.relative(workspace, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("path escapes workspace");
  }
  return resolved;
}

function protectedWritePath(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");
  return (
    normalized === "TASK.md" ||
    normalized.startsWith("contract") ||
    normalized.startsWith("state/") ||
    normalized.startsWith("test/") ||
    normalized.startsWith("tests/") ||
    normalized.includes("/test/") ||
    normalized.includes("/tests/")
  );
}

async function readTextFile(workspace, args) {
  const full = inside(workspace, args.path);
  const stat = await fs.stat(full);
  if (!stat.isFile()) throw new Error("path is not a file");
  if (stat.size > MAX_FILE_BYTES) {
    throw new Error(`file exceeds ${MAX_FILE_BYTES} bytes`);
  }
  return {
    path: args.path,
    content: await fs.readFile(full, "utf8")
  };
}

async function listDirectory(workspace, args) {
  const relativePath = args.path ?? ".";
  const full = inside(workspace, relativePath);
  const entries = await fs.readdir(full, { withFileTypes: true });
  return {
    path: relativePath,
    entries: entries
      .map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? "directory" : "file"
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  };
}

async function writeTextFile(workspace, args) {
  if (protectedWritePath(args.path)) {
    throw new Error("writing task, contract, state, or test files is prohibited");
  }
  if (typeof args.content !== "string") {
    throw new TypeError("content must be a string");
  }
  if (Buffer.byteLength(args.content, "utf8") > MAX_FILE_BYTES) {
    throw new Error(`content exceeds ${MAX_FILE_BYTES} bytes`);
  }
  const full = inside(workspace, args.path);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, args.content, "utf8");
  return {
    path: args.path,
    bytes: Buffer.byteLength(args.content, "utf8")
  };
}

async function replaceTextInFile(workspace, args) {
  if (protectedWritePath(args.path)) {
    throw new Error("writing task, contract, state, or test files is prohibited");
  }
  if (typeof args.oldText !== "string" || args.oldText.length === 0) {
    throw new TypeError("oldText must be a non-empty string");
  }
  if (typeof args.newText !== "string") {
    throw new TypeError("newText must be a string");
  }
  const full = inside(workspace, args.path);
  const original = await fs.readFile(full, "utf8");
  const occurrences = original.split(args.oldText).length - 1;
  if (occurrences === 0) throw new Error("oldText not found");
  if (args.replaceAll !== true && occurrences !== 1) {
    throw new Error(
      `oldText occurs ${occurrences} times; provide a unique match or replaceAll=true`
    );
  }
  const updated = args.replaceAll === true
    ? original.split(args.oldText).join(args.newText)
    : original.replace(args.oldText, args.newText);
  await fs.writeFile(full, updated, "utf8");
  return {
    path: args.path,
    replacements: args.replaceAll === true ? occurrences : 1
  };
}

function runPublicTests(workspace) {
  const result = spawnSync("npm", ["test"], {
    cwd: workspace,
    encoding: "utf8",
    timeout: 120000,
    env: process.env
  });
  return {
    exitCode: result.status,
    stdout: String(result.stdout || "").slice(-20000),
    stderr: String(result.stderr || "").slice(-20000)
  };
}

export const OLLAMA_WORKSPACE_TOOLS = Object.freeze([
  {
    type: "function",
    function: {
      name: "read_text_file",
      description: "Read a UTF-8 text file inside the current workspace.",
      parameters: {
        type: "object",
        required: ["path"],
        properties: {
          path: {
            type: "string",
            description: "Workspace-relative file path"
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_directory",
      description: "List one directory inside the current workspace.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Workspace-relative directory path, default ."
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "write_text_file",
      description:
        "Create or replace an implementation text file inside the workspace. Task, contract, state, and test files are protected.",
      parameters: {
        type: "object",
        required: ["path", "content"],
        properties: {
          path: { type: "string" },
          content: { type: "string" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "replace_text_in_file",
      description:
        "Replace exact text in an implementation file inside the workspace.",
      parameters: {
        type: "object",
        required: ["path", "oldText", "newText"],
        properties: {
          path: { type: "string" },
          oldText: { type: "string" },
          newText: { type: "string" },
          replaceAll: { type: "boolean" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "run_public_tests",
      description:
        "Run npm test inside the current workspace and return its output.",
      parameters: {
        type: "object",
        properties: {}
      }
    }
  }
]);

async function executeTool(workspace, call) {
  const name = call?.function?.name;
  const args = call?.function?.arguments ?? {};
  if (name === "read_text_file") return readTextFile(workspace, args);
  if (name === "list_directory") return listDirectory(workspace, args);
  if (name === "write_text_file") return writeTextFile(workspace, args);
  if (name === "replace_text_in_file") return replaceTextInFile(workspace, args);
  if (name === "run_public_tests") return runPublicTests(workspace);
  throw new Error(`unsupported tool: ${name}`);
}

export function isRetryableOllamaParserFailure(status, text) {
  if (status !== 500) return false;
  const value = String(text ?? "").toLowerCase();
  return (
    value.includes("xml syntax error") ||
    value.includes("unexpected eof") ||
    value.includes('"error":"eof"') ||
    value.includes('"error": "eof"')
  );
}

async function ollamaChat(
  baseUrl,
  body,
  {
    maxParserRetries = 2,
    timeoutMs = 180000
  } = {}
) {
  let parserRetries = 0;

  for (let attempt = 0; ; attempt += 1) {
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
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal
        }
      );
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(
          `Ollama chat timeout after ${timeoutMs}ms`
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();

    if (response.ok) {
      return {
        payload: JSON.parse(text),
        parserRetries
      };
    }

    if (
      attempt < maxParserRetries &&
      isRetryableOllamaParserFailure(
        response.status,
        text
      )
    ) {
      parserRetries += 1;
      continue;
    }

    throw new Error(
      `Ollama HTTP ${response.status}: ${text.slice(0, 2000)}`
    );
  }
}

export async function runOllamaWorkspaceAgent({
  model,
  workspace,
  prompt,
  baseUrl = "http://127.0.0.1:11434",
  maxTurns = 24,
  numCtx = 32768,
  chatTimeoutMs = 180000,
  totalTimeoutMs = 600000,
  onProgress = null
}) {
  const messages = [
    {
      role: "system",
      content: [
        "You are a local software implementation agent.",
        "Use the provided tools to inspect and modify the workspace.",
        "Do not merely describe edits or tool calls: perform them.",
        "Do not use or request MCP tools.",
        "Do not access the network, grader source, hidden tests, parent directories, or sibling directories.",
        "Do not modify TASK.md, contract files, state files, or test files.",
        "When implementation changes are needed, use write_text_file or replace_text_in_file.",
        "Run run_public_tests before concluding.",
        "A green public test is useful evidence but may not satisfy the full authoritative task contract.",
        "Finish with a concise summary after you have completed the requested work or are genuinely blocked."
      ].join("\n")
    },
    { role: "user", content: prompt }
  ];

  const transcript = [];
  let toolCallCount = 0;
  let writeToolCallCount = 0;
  let testToolCallCount = 0;
  let finalContent = "";
  let parserRetryCount = 0;
  const startedMs = Date.now();

  async function emitProgress(extra = {}) {
    if (typeof onProgress !== "function") return;
    await onProgress({
      turns: extra.turns ?? transcript
        .filter((item) => item?.message)
        .length,
      toolCallCount,
      writeToolCallCount,
      testToolCallCount,
      parserRetryCount,
      transcript,
      ...extra
    });
  }

  for (let turn = 1; turn <= maxTurns; turn += 1) {
    const elapsedMs = Date.now() - startedMs;
    const remainingMs = totalTimeoutMs - elapsedMs;

    if (remainingMs <= 0) {
      await emitProgress({
        completed: false,
        turns: turn - 1,
        failure: "agent_deadline_exhausted"
      });
      return {
        completed: false,
        turns: turn - 1,
        toolCallCount,
        writeToolCallCount,
        testToolCallCount,
        finalContent,
        parserRetryCount,
        transcript,
        failure: "agent_deadline_exhausted"
      };
    }

    const chat = await ollamaChat(baseUrl, {
      model,
      messages,
      tools: OLLAMA_WORKSPACE_TOOLS,
      stream: false,
      options: { num_ctx: numCtx }
    }, {
      timeoutMs: Math.min(
        chatTimeoutMs,
        remainingMs
      )
    });
    parserRetryCount += chat.parserRetries;

    const response = chat.payload;
    const message =
      response.message ?? {
        role: "assistant",
        content: ""
      };
    messages.push(message);
    transcript.push({ turn, message });
    await emitProgress({
      completed: false,
      turns: turn,
      phase: "assistant_message"
    });

    const toolCalls = message.tool_calls ?? [];
    if (toolCalls.length === 0) {
      finalContent = String(message.content ?? "");
      await emitProgress({
        completed: true,
        turns: turn,
        phase: "completed",
        finalContent
      });
      return {
        completed: true,
        turns: turn,
        toolCallCount,
        writeToolCallCount,
        testToolCallCount,
        finalContent,
        parserRetryCount,
        transcript
      };
    }

    for (const call of toolCalls) {
      toolCallCount += 1;
      const name = call?.function?.name;
      if (
        name === "write_text_file" ||
        name === "replace_text_in_file"
      ) {
        writeToolCallCount += 1;
      }
      if (name === "run_public_tests") {
        testToolCallCount += 1;
      }

      let result;
      try {
        result = {
          ok: true,
          result: await executeTool(workspace, call)
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

      const toolMessage = {
        role: "tool",
        content: JSON.stringify(result)
      };
      messages.push(toolMessage);
      transcript.push({
        turn,
        tool: name,
        result
      });
      await emitProgress({
        completed: false,
        turns: turn,
        phase: "tool_result",
        lastTool: name
      });
    }
  }

  await emitProgress({
    completed: false,
    turns: maxTurns,
    phase: "max_turns",
    failure: "max_turns_exhausted"
  });

  return {
    completed: false,
    turns: maxTurns,
    toolCallCount,
    writeToolCallCount,
    testToolCallCount,
    finalContent,
    parserRetryCount,
    transcript,
    failure: "max_turns_exhausted"
  };
}
