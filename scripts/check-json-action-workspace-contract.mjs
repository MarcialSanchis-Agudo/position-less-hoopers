import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runCommandAgent } from "../src/command-agent.mjs";
import { createExecutionRequest } from "../src/runner-port.mjs";
import { reserveOutput } from "./run-json-action-runtime-validation.mjs";
import { JSON_ACTION_PATH_CONTRACT_VERSION } from "../src/json-action-workspace-contract.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [model, outArg] = process.argv.slice(2);
if (!model || !outArg || process.argv.length !== 4) {
  throw new Error("usage: node scripts/check-json-action-workspace-contract.mjs <model> <new-output-directory>");
}
const output = await reserveOutput(ROOT, outArg);
const workspace = path.join(output, "fixture", "workspace");
const executionRoot = path.join(output, "fixture", "execution");
for (const dir of ["src", "test", "contract"]) {
  await fs.mkdir(path.join(workspace, dir), {recursive: true});
}
const protectedFiles = {
  "TASK.md": "Read contract/value.json. Repair src/value.mjs without changing the exported API. Run npm test. Do not edit the task, contract, tests, or package.json.\n",
  "contract/value.json": JSON.stringify({export: "value", requiredValue: 2}) + "\n",
  "package.json": JSON.stringify({type: "module", scripts: {test: "node --test"}}) + "\n",
  "test/value.test.mjs": [
    'import assert from "node:assert/strict";',
    'import test from "node:test";',
    'import { value } from "../src/value.mjs";',
    'test("contract value", () => assert.equal(value, 2));', ""
  ].join("\n")
};
for (const [relative, text] of Object.entries(protectedFiles)) {
  await fs.writeFile(path.join(workspace, relative), text);
}
await fs.writeFile(path.join(workspace, "src/value.mjs"), "export const value = 1;\n");
const hash = (text) => createHash("sha256").update(text).digest("hex");
const initialTests = spawnSync("npm", ["test"], {cwd: workspace, encoding: "utf8", timeout: 60000});
const settings = {maxSteps: 20, numCtx: 32768, requestTimeoutMs: 120000, totalTimeoutMs: 480000};
const adapter = JSON.parse(await fs.readFile(path.join(ROOT, "examples/adapters/direct-ollama-json-actions.json"), "utf8"));
adapter.command = process.execPath;
adapter.args = [path.join(ROOT, "examples/adapters/direct-ollama-json-action-agent.mjs")];
adapter.env = {
  PLH_LOCAL_MODEL: model,
  PLH_OLLAMA_BASE_URL: process.env.PLH_OLLAMA_BASE_URL || "http://127.0.0.1:11434",
  PLH_OLLAMA_JSON_MAX_STEPS: String(settings.maxSteps),
  PLH_OLLAMA_NUM_CTX: String(settings.numCtx),
  PLH_OLLAMA_JSON_REQUEST_TIMEOUT_MS: String(settings.requestTimeoutMs),
  PLH_OLLAMA_JSON_TOTAL_TIMEOUT_MS: String(settings.totalTimeoutMs)
};
const request = createExecutionRequest({
  region: {id: "path-smoke", goalId: "path-smoke", stateVersion: "1"},
  need: {id: "path-smoke", objective: "Repair the public fixture contract.",
    rationale: "Verify the actual CommandAgent-to-JSON adapter path boundary, not PLH performance."},
  responsibility: {id: "path-smoke", needId: "path-smoke", assigneeId: "fixture-agent",
    authority: {mode: "workspace_only"}, evidenceObligations: []},
  workspace,
  taskInstruction: "First read TASK.md and the contract it names. Repair the implementation, run public tests, and finish.",
  expectedEvidenceRefs: [],
  metadata: {developmentOnly: true, publicationClaimEligible: false}
});
const head = spawnSync("git", ["rev-parse", "HEAD"], {cwd: ROOT, encoding: "utf8"});
const provenance = {
  schemaVersion: 1, sourceCommit: head.status === 0 ? head.stdout.trim() : null,
  pathContractVersion: JSON_ACTION_PATH_CONTRACT_VERSION,
  model, settings, adapterTimeoutMs: adapter.timeoutMs, node: process.version,
  baseUrl: adapter.env.PLH_OLLAMA_BASE_URL, startedAt: new Date().toISOString(),
  developmentOnly: true, publicationClaimEligible: false, sourceHashes: {}
};
for (const file of ["src/command-agent.mjs", "src/runner-port.mjs", "src/ollama-json-action-loop.mjs",
  "src/ollama-tool-loop.mjs", "src/json-action-workspace-contract.mjs",
  "examples/adapters/direct-ollama-json-action-agent.mjs", "examples/adapters/direct-ollama-json-actions.json"]) {
  provenance.sourceHashes[file] = hash(await fs.readFile(path.join(ROOT, file)));
}
await fs.writeFile(path.join(output, "path-contract-provenance.json"), JSON.stringify(provenance, null, 2) + "\n", {flag: "wx"});
const startedMs = Date.now();
let execution = null;
let executionError = null;
try { execution = await runCommandAgent(request, adapter, {runRoot: executionRoot}); }
catch (error) { executionError = error.message; }
let telemetry = null;
try { telemetry = JSON.parse(await fs.readFile(path.join(executionRoot, "provider-wrapper-telemetry.json"), "utf8")); }
catch (error) { executionError ??= error.message; }
const transcript = telemetry?.transcript ?? [];
const selected = transcript.filter((item) => item?.action);
const results = new Map(transcript.filter((item) => item?.actionResult).map((item) => [item.step, item.actionResult]));
const actions = selected.map(({step, action}) => ({step, action: action.action, path: action.path ?? null,
  ok: results.get(step)?.ok ?? null, error: results.get(step)?.error ?? null,
  testExitCode: results.get(step)?.result?.exitCode ?? null}));
const successfulRead = (file) => selected.some((item) => item.action.action === "read_text_file" &&
  item.action.path === file && results.get(item.step)?.ok === true);
const successfulLineEdits = selected.filter((item) => item.action.action === "replace_line_range" &&
  item.action.path === "src/value.mjs" && results.get(item.step)?.ok === true);
const lastEdit = successfulLineEdits.at(-1)?.step ?? Infinity;
const finalSource = await fs.readFile(path.join(workspace, "src/value.mjs"), "utf8");
const hostTests = spawnSync("npm", ["test"], {cwd: workspace, encoding: "utf8", timeout: 60000});
let protectedUnchanged = true;
for (const [file, text] of Object.entries(protectedFiles)) {
  try { if (hash(await fs.readFile(path.join(workspace, file))) !== hash(text)) protectedUnchanged = false; }
  catch { protectedUnchanged = false; }
}
const relativePathsOnly = actions.every(({path: value}) => value == null ||
  (typeof value === "string" && !path.isAbsolute(value) && !value.startsWith("~") &&
    !/^[A-Za-z]:/.test(value) && !value.split(/[\\/]/).includes("..")));
const gates = {
  initiallyRed: initialTests.status === 1,
  normalCompletion: executionError == null && execution?.result?.status === "completed" &&
    execution?.telemetry?.exitCode === 0 && telemetry?.agentCompleted === true &&
    telemetry?.failure == null && telemetry?.agentError == null,
  correctAdapter: telemetry?.pathContractVersion === JSON_ACTION_PATH_CONTRACT_VERSION &&
    telemetry?.requestedModel === model,
  relativePathsOnly,
  noRejectedPathActions: !actions.some((row) => /absolute paths|path escapes workspace/.test(row.error ?? "")),
  taskAndContractRead: successfulRead("TASK.md") && successfulRead("contract/value.json"),
  sourceReadWithLines: selected.some((item) => item.action.action === "read_text_file" &&
    item.action.path === "src/value.mjs" && item.action.withLineNumbers === true && results.get(item.step)?.ok === true),
  successfulLineEdit: successfulLineEdits.length > 0,
  greenTestAfterEdit: actions.some((row) => row.step > lastEdit && row.action === "run_public_tests" && row.ok === true && row.testExitCode === 0),
  finishLast: actions.at(-1)?.action === "finish",
  protectedUnchanged,
  exactSource: finalSource === "export const value = 2;\n",
  independentHostPass: hostTests.status === 0
};
const summary = {
  schemaVersion: 1, developmentOnly: true, publicationClaimEligible: false,
  pathContractVersion: JSON_ACTION_PATH_CONTRACT_VERSION, model,
  durationMs: Date.now() - startedMs, agentCompleted: telemetry?.agentCompleted ?? false,
  actionCount: telemetry?.actionCount ?? 0, successfulWriteActionCount: successfulLineEdits.length,
  pathRejectionCount: actions.filter((row) => /absolute paths|path escapes workspace/.test(row.error ?? "")).length,
  failure: telemetry?.failure ?? null, agentError: telemetry?.agentError ?? executionError,
  hostTestExitCode: hostTests.status, gates,
  passed: Object.values(gates).every(Boolean),
  failedGates: Object.keys(gates).filter((key) => !gates[key]), actions,
  telemetryPath: path.join(executionRoot, "provider-wrapper-telemetry.json"),
  promptPath: path.join(executionRoot, "json-action-agent-prompt.md")
};
const resultPath = path.join(output, "path-contract-preflight.json");
await fs.writeFile(resultPath + ".tmp", JSON.stringify(summary, null, 2) + "\n", {flag: "wx"});
await fs.rename(resultPath + ".tmp", resultPath);
console.log(JSON.stringify({...summary, resultPath}, null, 2));
process.exitCode = summary.passed ? 0 : 1;
