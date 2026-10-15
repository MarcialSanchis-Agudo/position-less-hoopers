import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  runOllamaJsonActionAgent
} from "../src/ollama-json-action-loop.mjs";

const model = process.argv[2] || "qwen3.5:9b";
const root = process.cwd();
const outDir = path.join(
  root,
  "results/local/direct-ollama-json-action-preflight",
  model.replace(/[^A-Za-z0-9._-]+/g, "_")
);
const workspace = path.join(outDir, "workspace");

await fs.rm(outDir, {
  recursive: true,
  force: true
});
await fs.mkdir(
  path.join(workspace, "src"),
  { recursive: true }
);
await fs.mkdir(
  path.join(workspace, "test"),
  { recursive: true }
);

await fs.writeFile(
  path.join(workspace, "package.json"),
  JSON.stringify({
    type: "module",
    scripts: {
      test: "node --test"
    }
  }, null, 2) + "\n"
);

await fs.writeFile(
  path.join(workspace, "src/value.mjs"),
  "export const value = 1;\n"
);

await fs.writeFile(
  path.join(workspace, "test/value.test.mjs"),
  [
    'import assert from "node:assert/strict";',
    'import test from "node:test";',
    'import { value } from "../src/value.mjs";',
    '',
    'test("value is repaired", () => {',
    '  assert.equal(value, 2);',
    '});',
    ''
  ].join("\n")
);

const startedMs = Date.now();
let agent;
let error = null;

try {
  agent = await runOllamaJsonActionAgent({
    model,
    workspace,
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
    ].join("\n")
  });
} catch (caught) {
  error =
    caught instanceof Error
      ? caught.message
      : String(caught);
  agent = {
    completed: false,
    steps: 0,
    actionCount: 0,
    writeActionCount: 0,
    testActionCount: 0,
    finalContent: "",
    transcript: [],
    failure: error
  };
}

const finalSource = await fs.readFile(
  path.join(workspace, "src/value.mjs"),
  "utf8"
);

const hostTests = spawnSync("npm", ["test"], {
  cwd: workspace,
  encoding: "utf8",
  timeout: 60000
});

const actions = (agent.transcript ?? [])
  .filter((item) => item?.action)
  .map((item) => item.action.action);

const passed =
  error == null &&
  agent.completed === true &&
  agent.writeActionCount >= 1 &&
  agent.testActionCount >= 1 &&
  actions.includes("replace_line_range") &&
  actions.at(-1) === "finish" &&
  hostTests.status === 0 &&
  finalSource === "export const value = 2;\n";

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
  actions,
  failure: agent.failure ?? null,
  error,
  finalSource,
  hostTestExitCode: hostTests.status,
  passed,
  transcript: agent.transcript
};

await fs.writeFile(
  path.join(
    outDir,
    "structured-json-action-preflight.json"
  ),
  JSON.stringify(result, null, 2) + "\n"
);

console.log(JSON.stringify({
  runtime: result.runtime,
  model,
  durationMs: result.durationMs,
  agentCompleted: result.agentCompleted,
  agentSteps: result.agentSteps,
  actionCount: result.actionCount,
  writeActionCount: result.writeActionCount,
  testActionCount: result.testActionCount,
  actions: result.actions,
  hostTestExitCode: result.hostTestExitCode,
  passed
}, null, 2));

process.exit(passed ? 0 : 1);
