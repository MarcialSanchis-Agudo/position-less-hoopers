import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { runOllamaWorkspaceAgent } from "../../src/ollama-tool-loop.mjs";

const requestPath = process.env.PLH_EXECUTION_REQUEST;
const resultPath = process.env.PLH_EXECUTION_RESULT;
const workspace = process.env.PLH_WORKSPACE;
const instructionsPath = process.env.PLH_AGENT_INSTRUCTIONS;
const runRoot = process.env.PLH_RUN_ROOT || workspace;

if (!requestPath || !resultPath || !workspace || !instructionsPath) {
  process.stderr.write("Missing PLH execution environment variables\n");
  process.exit(2);
}

const request = JSON.parse(await fs.readFile(requestPath, "utf8"));
const instructions = await fs.readFile(instructionsPath, "utf8");
const model = process.env.PLH_LOCAL_MODEL || "qwen3.5:9b";
const baseUrl =
  process.env.PLH_OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const maxTurns = Number(process.env.PLH_OLLAMA_MAX_TURNS || 24);
const numCtx = Number(process.env.PLH_OLLAMA_NUM_CTX || 32768);

const prompt = [
  instructions.trim(),
  "",
  "## Direct Ollama tool-loop rules",
  "",
  "- You have explicit workspace tools for reading, listing, writing, exact text replacement, and running public tests.",
  "- Use those tools directly. Do not request MCP, shell, browser, web, or Codex tools.",
  "- Inspect TASK.md and the active workspace state required by the assignment.",
  "- If authoritative evidence feedback says the Need is unsatisfied, make the implementation changes needed to address those obligations even if public tests are already green.",
  "- Never modify task, contract, state, or test files.",
  "- Do not claim authoritative external evidence; the PLH harness owns the external grader."
].join("\n");

const startedAt = new Date().toISOString();
const startedMs = Date.now();

let agent;
let agentError = null;
try {
  agent = await runOllamaWorkspaceAgent({
    model,
    workspace,
    prompt,
    baseUrl,
    maxTurns,
    numCtx
  });
} catch (error) {
  agentError =
    error instanceof Error ? error.message : String(error);
  agent = {
    completed: false,
    turns: 0,
    toolCallCount: 0,
    writeToolCallCount: 0,
    testToolCallCount: 0,
    finalContent: "",
    transcript: [],
    failure: agentError
  };
}

const tests = spawnSync("npm", ["test"], {
  cwd: workspace,
  encoding: "utf8",
  env: process.env,
  timeout: 120000
});

const finishedMs = Date.now();
const status =
  agent.completed === true &&
  tests.status === 0 &&
  agentError == null
    ? "completed"
    : "failed";

const result = {
  schemaVersion: 1,
  requestId: request.requestId,
  status,
  evidenceRefs: [],
  summary:
    status === "completed"
      ? `Direct Ollama agent completed after ${agent.turns} turns, ${agent.toolCallCount} tool calls, and ${agent.writeToolCallCount} write calls; public tests pass. Authoritative evidence remains external.`
      : `Direct Ollama agent failed or exhausted its tool loop: ${agent.failure ?? agentError ?? "unknown failure"}`,
  retryable: status !== "completed"
};

await fs.writeFile(
  resultPath,
  JSON.stringify(result, null, 2) + "\n"
);

const telemetry = {
  schemaVersion: 1,
  provider: "Local",
  cli: "Direct Ollama API tool loop",
  requestedModel: model,
  localProvider: "ollama",
  baseUrl,
  freshSession: true,
  startedAt,
  finishedAt: new Date().toISOString(),
  durationMs: finishedMs - startedMs,
  agentExitCode: agentError == null ? 0 : 1,
  agentSignal: null,
  agentError,
  agentCompleted: agent.completed,
  agentTurns: agent.turns,
  toolCallCount: agent.toolCallCount,
  writeToolCallCount: agent.writeToolCallCount,
  testToolCallCount: agent.testToolCallCount,
  publicTestExitCode: tests.status,
  publicTestStdout: tests.stdout ?? "",
  publicTestStderr: tests.stderr ?? "",
  finalContent: agent.finalContent,
  transcript: agent.transcript
};

await fs.mkdir(runRoot, { recursive: true });
await fs.writeFile(
  path.join(runRoot, "provider-wrapper-telemetry.json"),
  JSON.stringify(telemetry, null, 2) + "\n"
);

if (agent.finalContent) {
  process.stdout.write(agent.finalContent + "\n");
}
if (agentError) {
  process.stderr.write(agentError + "\n");
}

process.exit(status === "completed" ? 0 : 1);
