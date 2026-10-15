import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  runOllamaJsonActionAgent
} from "../../src/ollama-json-action-loop.mjs";

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
const baseUrl = process.env.PLH_OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const maxSteps = Number(process.env.PLH_OLLAMA_JSON_MAX_STEPS || 20);
const numCtx = Number(process.env.PLH_OLLAMA_NUM_CTX || 32768);
const requestTimeoutMs = Number(process.env.PLH_OLLAMA_JSON_REQUEST_TIMEOUT_MS || 120000);
const totalTimeoutMs = Number(process.env.PLH_OLLAMA_JSON_TOTAL_TIMEOUT_MS || 480000);

const prompt = [
  instructions.trim(), "", "## Structured JSON-action runtime rules", "",
  "- This runtime does not expose native Ollama tools.",
  "- Choose one host-executed JSON action at a time.",
  "- For existing implementation files, read with line numbers and prefer replace_line_range.",
  "- Do not overwrite existing implementation files with write_text_file.",
  "- Run public tests after coherent changes.",
  "- A green public test is useful but authoritative external evidence remains owned by the PLH harness.",
  "- Finish when the requested contract work has been addressed and public tests have been checked."
].join("\n");

const telemetryPath = path.join(runRoot, "provider-wrapper-telemetry.json");
const startedAt = new Date().toISOString();
const startedMs = Date.now();
await fs.mkdir(runRoot, { recursive: true });

async function writeJsonAtomic(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value, null, 2) + "\n");
  await fs.rename(temporary, file);
}

let latestSnapshot = {
  completed: false, steps: 0, actionCount: 0, writeActionCount: 0,
  testActionCount: 0, requestCount: 0, lastRequest: null,
  finalContent: "", transcript: [], phase: "starting"
};

async function persistTelemetry(snapshot = {}, extra = {}) {
  await writeJsonAtomic(telemetryPath, {
    schemaVersion: 1,
    provider: "Local",
    cli: "Direct Ollama structured JSON action loop",
    requestedModel: model,
    localProvider: "ollama",
    baseUrl,
    freshSession: true,
    startedAt,
    finishedAt: extra.finishedAt ?? null,
    durationMs: Date.now() - startedMs,
    agentExitCode: extra.agentExitCode ?? null,
    agentSignal: null,
    agentError: extra.agentError ?? snapshot.agentError ?? null,
    agentCompleted: snapshot.completed ?? false,
    agentSteps: snapshot.steps ?? 0,
    actionCount: snapshot.actionCount ?? 0,
    writeActionCount: snapshot.writeActionCount ?? 0,
    testActionCount: snapshot.testActionCount ?? 0,
    requestCount: snapshot.requestCount ?? 0,
    lastRequest: snapshot.lastRequest ?? null,
    publicTestExitCode: extra.publicTestExitCode ?? null,
    publicTestStdout: extra.publicTestStdout ?? "",
    publicTestStderr: extra.publicTestStderr ?? "",
    finalContent: snapshot.finalContent ?? "",
    failure: snapshot.failure ?? null,
    phase: extra.phase ?? snapshot.phase ?? null,
    lastAction: snapshot.lastAction ?? null,
    transcript: snapshot.transcript ?? []
  });
}

await persistTelemetry(latestSnapshot);
let agent;
let agentError = null;
try {
  agent = await runOllamaJsonActionAgent({
    model, workspace, prompt, baseUrl, maxSteps, numCtx,
    requestTimeoutMs, totalTimeoutMs,
    onProgress: async (snapshot) => {
      latestSnapshot = snapshot;
      await persistTelemetry(snapshot);
    }
  });
  agentError = agent.agentError ?? null;
} catch (error) {
  agentError = error instanceof Error ? error.message : String(error);
  agent = {
    ...latestSnapshot,
    completed: false,
    failure: latestSnapshot.failure ?? "agent_error",
    agentError,
    phase: "agent_error"
  };
  await persistTelemetry(agent, { agentExitCode: 1, agentError });
}

const tests = agent.completed === true
  ? spawnSync("npm", ["test"], {
      cwd: workspace, encoding: "utf8", env: process.env, timeout: 120000
    })
  : { status: null, stdout: "", stderr: "" };
const status = agent.completed === true && tests.status === 0 && agentError == null
  ? "completed" : "failed";

const result = {
  schemaVersion: 1,
  requestId: request.requestId,
  status,
  evidenceRefs: [],
  summary: status === "completed"
    ? `Structured JSON-action agent completed after ${agent.steps} steps, ${agent.actionCount} actions, and ${agent.writeActionCount} write actions; public tests pass. Authoritative evidence remains external.`
    : `Structured JSON-action agent failed or exhausted its loop: ${agent.failure ?? agentError ?? "unknown failure"}`,
  retryable: status !== "completed"
};
await writeJsonAtomic(resultPath, result);
await persistTelemetry(agent, {
  finishedAt: new Date().toISOString(),
  agentExitCode: agent.completed === true && agentError == null ? 0 : 1,
  agentError,
  publicTestExitCode: tests.status,
  publicTestStdout: tests.stdout ?? "",
  publicTestStderr: tests.stderr ?? "",
  phase: status === "completed" ? "completed" : "failed"
});
if (agent.finalContent) process.stdout.write(agent.finalContent + "\n");
if (agentError) process.stderr.write(agentError + "\n");
process.exit(status === "completed" ? 0 : 1);
