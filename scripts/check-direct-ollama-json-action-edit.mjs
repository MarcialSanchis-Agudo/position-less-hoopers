import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  runOllamaJsonActionAgent
} from "../src/ollama-json-action-loop.mjs";

const model = process.argv[2] || "qwen3.5:9b";
const outDir = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.join(process.cwd(), "results/local/direct-ollama-json-action-preflight",
      model.replace(/[^A-Za-z0-9._-]+/g, "_"));
const workspace = path.join(outDir, "workspace");
const telemetryPath = path.join(outDir, "provider-wrapper-telemetry.json");
const resultPath = path.join(outDir, "structured-json-action-preflight.json");

// Refuse to delete or reuse a previous attempt's evidence.
await fs.mkdir(path.dirname(outDir), { recursive: true });
await fs.mkdir(outDir);
await fs.mkdir(path.join(workspace, "src"), { recursive: true });
await fs.mkdir(path.join(workspace, "test"), { recursive: true });
await fs.writeFile(path.join(workspace, "package.json"), JSON.stringify({
  type: "module", scripts: { test: "node --test" }
}, null, 2) + "\n");
await fs.writeFile(path.join(workspace, "src/value.mjs"), "export const value = 1;\n");
await fs.writeFile(path.join(workspace, "test/value.test.mjs"), [
  'import assert from "node:assert/strict";',
  'import test from "node:test";',
  'import { value } from "../src/value.mjs";', '',
  'test("value is repaired", () => {',
  '  assert.equal(value, 2);', '});', ''
].join("\n"));

async function writeJsonAtomic(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value, null, 2) + "\n");
  await fs.rename(temporary, file);
}

const startedMs = Date.now();
let latestSnapshot = {
  completed: false, steps: 0, actionCount: 0, writeActionCount: 0,
  testActionCount: 0, requestCount: 0, lastRequest: null,
  finalContent: "", transcript: [], phase: "starting"
};
async function persistProgress(snapshot) {
  latestSnapshot = snapshot;
  await writeJsonAtomic(telemetryPath, {
    schemaVersion: 1,
    runtime: "direct-ollama-structured-json-action-loop",
    model,
    durationMs: Date.now() - startedMs,
    ...snapshot
  });
}
await persistProgress(latestSnapshot);
let agent;
let error = null;
try {
  agent = await runOllamaJsonActionAgent({
    model, workspace,
    baseUrl: process.env.PLH_OLLAMA_BASE_URL || "http://127.0.0.1:11434",
    maxSteps: 12,
    numCtx: 16384,
    requestTimeoutMs: 90000,
    totalTimeoutMs: 300000,
    prompt: [
      "Repair the existing implementation so npm test passes.",
      "The only implementation file is src/value.mjs.",
      "Do not modify tests or package.json.",
      "Read the existing source with line numbers.",
      "Use replace_line_range for the existing file.",
      "Run public tests after editing.",
      "Finish when the tests pass."
    ].join("\n"),
    onProgress: persistProgress
  });
  error = agent.agentError ?? null;
} catch (caught) {
  error = caught instanceof Error ? caught.message : String(caught);
  agent = {
    ...latestSnapshot,
    completed: false,
    failure: latestSnapshot.failure ?? "agent_error",
    agentError: error,
    phase: "agent_error"
  };
}
await persistProgress(agent);
const finalSource = await fs.readFile(path.join(workspace, "src/value.mjs"), "utf8");
const hostTests = spawnSync("npm", ["test"], {
  cwd: workspace, encoding: "utf8", timeout: 60000
});
const actions = (agent.transcript ?? []).filter((item) => item?.action)
  .map((item) => item.action.action);
const passed = error == null && agent.completed === true &&
  agent.writeActionCount >= 1 && agent.testActionCount >= 1 &&
  actions.includes("replace_line_range") && actions.at(-1) === "finish" &&
  hostTests.status === 0 && finalSource === "export const value = 2;\n";
const result = {
  schemaVersion: 1,
  runtime: "direct-ollama-structured-json-action-loop",
  model,
  durationMs: Date.now() - startedMs,
  agentCompleted: agent.completed,
  agentSteps: agent.steps,
  actionCount: agent.actionCount,
  writeActionCount: agent.writeActionCount,
  testActionCount: agent.testActionCount,
  requestCount: agent.requestCount,
  lastRequest: agent.lastRequest,
  actions,
  failure: agent.failure ?? null,
  error,
  finalSource,
  hostTestExitCode: hostTests.status,
  passed,
  transcript: agent.transcript
};
await writeJsonAtomic(resultPath, result);
const { transcript, finalSource: source, ...summary } = result;
console.log(JSON.stringify({ ...summary, resultPath, telemetryPath }, null, 2));
process.exit(passed ? 0 : 1);
