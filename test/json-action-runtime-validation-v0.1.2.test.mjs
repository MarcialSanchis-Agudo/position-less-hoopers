import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { EVAL_PATH, toolErrorStats, enhanceSummary, summarizeV012 } from "../scripts/summarize-json-action-runtime-validation-v0.1.2.mjs";
import { buildLaunchV012, gitBlobSha, verifyRuntime } from "../scripts/run-json-action-runtime-validation-v0.1.2.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const config = JSON.parse(await fs.readFile(path.join(ROOT, EVAL_PATH), "utf8"));
const provenance = {evaluationSetId: config.evaluationSetId,
  runtimeSourceCommit: config.executorFamily.runtimeSourceCommit,
  pathContractVersion: config.executorFamily.pathContractVersion,
  runtimeBlobs: config.executorFamily.runtimeBlobs};
function fixture(count = 5) {
  const records = config.baselineOrder.slice(0, count).map((baselineId, scheduleIndex) => ({
    scheduleIndex, baselineId, taskPackId: config.runtimeValidation.taskPackId,
    scenarioId: config.runtimeValidation.scenarioId, status: "failed", eligibleForScientificAnalysis: true,
    cli: config.executorFamily.client, model: "qwen3.5:9b", agentCompleted: true, agentExitCode: 0,
    actionCount: 3, successfulHostActionCount: 2, finalCorrect: false, evidenceSatisfied: false
  }));
  const telemetry = new Map(records.map((row) => [row.scheduleIndex, {
    pathContractVersion: config.executorFamily.pathContractVersion, transcript: [
      {step: 1, action: {action: "replace_line_range", path: "src/value.mjs"}},
      {step: 1, actionResult: {ok: false, error: "endLine 2 exceeds file line count 1"}},
      {step: 2, action: {action: "replace_line_range", path: "src/value.mjs"}},
      {step: 2, actionResult: {ok: true}}, {step: 3, action: {action: "finish"}}
    ]
  }]));
  const cells = new Map(records.map((row) => [row.scheduleIndex, {final: {correct: false, evidenceSatisfied: false}}]));
  const base = {records, sourceIssues: [], gates: {exactlyFiveExpectedCells: count === 5}, externallyVerifiedSuccessCount: 0};
  return {base, telemetry, cells};
}
function enhanced(f = fixture(), source = provenance, issues = []) {
  return enhanceSummary(f.base, f.telemetry, f.cells, source, config, issues);
}
async function temp(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "plh-v012-test-"));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  return root;
}

test("v012: launch uses the new evaluation path and caps five cells with unchanged budgets", () => {
  const launch = buildLaunchV012(config, "results/local/new", {
    PLH_LOCAL_MODEL: "wrong", PLH_OLLAMA_NUM_CTX: "10", PLH_OLLAMA_JSON_MAX_STEPS: "999",
    PLH_OLLAMA_BASE_URL: "http://remote.invalid"
  });
  assert.equal(launch.args[1], EVAL_PATH);
  assert.deepEqual(launch.args.slice(-3), [config.executorFamily.adapter, "1", "5"]);
  assert.equal(launch.env.PLH_LOCAL_MODEL, "qwen3.5:9b");
  assert.equal(launch.env.PLH_OLLAMA_NUM_CTX, "32768");
  assert.equal(launch.env.PLH_OLLAMA_JSON_MAX_STEPS, "20");
  assert.equal(launch.env.PLH_OLLAMA_JSON_REQUEST_TIMEOUT_MS, "120000");
  assert.equal(launch.env.PLH_OLLAMA_JSON_TOTAL_TIMEOUT_MS, "480000");
  assert.equal(launch.env.PLH_OLLAMA_BASE_URL, "http://127.0.0.1:11434");
});
test("v012: wrong condition and old runtime cannot be launched", () => {
  const old = structuredClone(config); old.executorFamily.runtimeSourceCommit = "old";
  assert.throws(() => buildLaunchV012(old, "results/new"), /Expected the frozen/);
});
test("v012: recovered edit errors remain visible without invalidating a completed batch", () => {
  const result = enhanced();
  assert.equal(result.runtimeValidationPassed, true);
  assert.equal(result.totalToolErrors, 5);
  assert.equal(result.totalPathRejections, 0);
  assert.equal(result.externalGradeAvailableCount, 5);
  assert.equal(result.externallyVerifiedSuccessCount, 0);
});
test("v012: duplicate error results are not double-counted", () => {
  const t = {transcript: [
    {step: 1, action: {action: "list_directory", path: "/outside"}},
    {step: 1, actionResult: {ok: false, error: "absolute paths are not allowed"}},
    {step: 1, actionResult: {ok: false, error: "absolute paths are not allowed"}}
  ]};
  assert.equal(toolErrorStats(t).toolErrorCount, 1);
  assert.equal(toolErrorStats(t).pathRejectionCount, 1);
});
test("v012: incomplete batch is not falsely described as a model mismatch or graded failure", () => {
  const f = fixture(1);
  f.base.records[0].agentCompleted = false;
  f.base.records[0].successfulHostActionCount = 0;
  f.cells.set(0, {status: "infrastructure_failed"});
  const result = enhanced(f);
  assert.equal(result.runtimeValidationPassed, false);
  assert.deepEqual(result.observedDiagnostics.runtimeModelMismatches, []);
  assert.deepEqual(result.observedDiagnostics.missingBaselines, ["B1", "B2", "B3", "P"]);
  assert.deepEqual(result.observedDiagnostics.incompleteAgents, ["B0"]);
  assert.equal(result.records[0].finalGradeAvailable, false);
  assert.equal(result.records[0].finalCorrect, null);
  assert.equal(result.records[0].evidenceSatisfied, null);
  assert.equal(result.externalGradeAvailableCount, 0);
});
test("v012: path-contract version missing in otherwise complete records fails closed", () => {
  const f = fixture(); delete f.telemetry.get(1).pathContractVersion;
  const result = enhanced(f);
  assert.equal(result.runtimeValidationPassed, false);
  assert.deepEqual(result.observedDiagnostics.pathContractMismatches, ["B1"]);
});
test("v012: tampered source pins or unreadable evidence cannot satisfy provenance", () => {
  const changed = structuredClone(provenance); changed.runtimeBlobs["src/json-action-workspace-contract.mjs"] = "wrong";
  assert.equal(enhanced(fixture(), changed).runtimeValidationPassed, false);
  assert.equal(enhanced(fixture(), provenance, ["missing record"]).runtimeValidationPassed, false);
});
test("v012: blob verification detects changed helper bytes", async (t) => {
  const root = await temp(t);
  await fs.writeFile(path.join(root, "helper.mjs"), "original\n");
  const blobs = {"helper.mjs": gitBlobSha("original\n")};
  await verifyRuntime(root, blobs);
  await fs.writeFile(path.join(root, "helper.mjs"), "changed\n");
  await assert.rejects(verifyRuntime(root, blobs), /Frozen runtime file changed/);
});

test("repository: runtime pins match the live-preflighted source snapshot", async () => {
  await verifyRuntime(ROOT, config.executorFamily.runtimeBlobs);
});
test("repository: previous schedule and all scientific fields and budgets are preserved", async () => {
  const prior = JSON.parse(await fs.readFile(path.join(ROOT, config.previousCondition), "utf8"));
  for (const key of ["prospectiveTaskPacks", "taskProfiles", "baselineOrder", "scenarioClasses",
    "analysisPlan", "runner", "cellRunner", "ontologyConfig"]) {
    assert.deepEqual(config[key], prior[key], key);
  }
  assert.deepEqual(config.executorFamily.settings, prior.executorFamily.settings);
});
test("repository: actual file summarizer handles complete and partial runtime evidence", async (t) => {
  const root = await temp(t);
  const run = path.join(root, "run");
  const pack = path.join(root, "examples/artifact-lineage-incident");
  await fs.mkdir(path.join(pack, "seed/src"), {recursive: true});
  await fs.writeFile(path.join(pack, "seed/src/artifacts.mjs"), "before");
  await fs.writeFile(path.join(pack, "task-pack.json"), JSON.stringify({taskPackId: "artifact-lineage-incident", seedPath: "seed"}));
  await fs.mkdir(run);
  const f = fixture();
  await fs.writeFile(path.join(run, "json-action-validation-provenance.json"), JSON.stringify(provenance));
  await fs.writeFile(path.join(run, "ontology-stress-checkpoint.json"), JSON.stringify({
    evaluationSetId: config.evaluationSetId, adapter: config.executorFamily.adapter,
    repeats: 1, nextCellIndex: 5, records: f.base.records, infrastructureFailures: []
  }));
  for (const row of f.base.records) {
    const cellRoot = path.join(run, "cells", String(row.scheduleIndex).padStart(3, "0"), row.taskPackId, row.scenarioId, row.baselineId);
    await fs.mkdir(path.join(cellRoot, "execution"), {recursive: true});
    await fs.mkdir(path.join(cellRoot, "workspace/src"), {recursive: true});
    await fs.writeFile(path.join(cellRoot, "workspace/src/artifacts.mjs"), "after");
    await fs.writeFile(path.join(cellRoot, "ontology-stress-cell-result.json"), JSON.stringify({...row, final: {correct: false, evidenceSatisfied: false}}));
    await fs.writeFile(path.join(cellRoot, "execution/provider-wrapper-telemetry.json"), JSON.stringify({
      ...row, ...f.telemetry.get(row.scheduleIndex), requestedModel: row.model, publicTestExitCode: 1,
      failure: null, agentError: null
    }));
  }
  const result = await summarizeV012(run, config, root);
  assert.equal(result.runtimeValidationPassed, true);
  assert.equal(result.totalToolErrors, 5);
  assert.equal(result.externallyVerifiedSuccessCount, 0);
  const telemetryPath = path.join(run, "cells/000/artifact-lineage-incident/artifact-lineage-clean-v2/B0/execution/provider-wrapper-telemetry.json");
  await fs.writeFile(telemetryPath, "{");
  assert.equal((await summarizeV012(run, config, root)).runtimeValidationPassed, false);
});
