import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { runOllamaWorkspaceAgent } from "../src/ollama-tool-loop.mjs";

const model = process.argv[2] || "qwen3.5:9b";
const root = process.cwd();
const outDir = path.join(
  root,
  "results/local/direct-ollama-existing-file-edit-preflight",
  model.replace(/[^A-Za-z0-9._-]+/g, "_")
);
const workspace = path.join(outDir, "workspace");

await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(path.join(workspace, "src"), { recursive: true });
await fs.mkdir(path.join(workspace, "test"), { recursive: true });

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

const agent = await runOllamaWorkspaceAgent({
  model,
  workspace,
  maxTurns: 12,
  numCtx: 16384,
  chatTimeoutMs: 120000,
  totalTimeoutMs: 360000,
  prompt: [
    "Repair the existing implementation so npm test passes.",
    "The only implementation file is src/value.mjs.",
    "Do not modify tests or package.json.",
    "Read the existing file with line numbers.",
    "Prefer replace_line_range for the existing file.",
    "Run public tests after editing and finish when they pass."
  ].join("\n")
});

const finalSource = await fs.readFile(
  path.join(workspace, "src/value.mjs"),
  "utf8"
);

const hostTests = spawnSync("npm", ["test"], {
  cwd: workspace,
  encoding: "utf8",
  timeout: 60000
});

const lineRangeToolCalls = (agent.transcript ?? [])
  .filter(
    (item) => item?.tool === "replace_line_range"
  ).length;

const passed =
  agent.completed === true &&
  agent.writeToolCallCount >= 1 &&
  agent.testToolCallCount >= 1 &&
  hostTests.status === 0 &&
  finalSource === "export const value = 2;\n";

const result = {
  schemaVersion: 1,
  runtime: "direct-ollama-api-tool-loop",
  model,
  agentCompleted: agent.completed,
  agentTurns: agent.turns,
  toolCallCount: agent.toolCallCount,
  writeToolCallCount: agent.writeToolCallCount,
  lineRangeToolCalls,
  testToolCallCount: agent.testToolCallCount,
  parserRetryCount: agent.parserRetryCount,
  failure: agent.failure ?? null,
  finalSource,
  hostTestExitCode: hostTests.status,
  passed,
  transcript: agent.transcript
};

await fs.writeFile(
  path.join(outDir, "existing-file-edit-preflight.json"),
  JSON.stringify(result, null, 2) + "\n"
);

console.log(JSON.stringify({
  model,
  agentCompleted: result.agentCompleted,
  agentTurns: result.agentTurns,
  toolCallCount: result.toolCallCount,
  writeToolCallCount: result.writeToolCallCount,
  lineRangeToolCalls: result.lineRangeToolCalls,
  testToolCallCount: result.testToolCallCount,
  parserRetryCount: result.parserRetryCount,
  hostTestExitCode: result.hostTestExitCode,
  passed
}, null, 2));

process.exit(passed ? 0 : 1);
