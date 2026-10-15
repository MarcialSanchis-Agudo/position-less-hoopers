import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { EVAL_PATH, buildLaunch, gitBlobSha, reserveOutput } from "../scripts/run-json-action-runtime-validation.mjs";
import { actionStats, evaluateBatch, summarizeRun } from "../scripts/summarize-json-action-runtime-validation.mjs";

const root = new URL("../", import.meta.url);
const config = JSON.parse(await fs.readFile(new URL(EVAL_PATH, root), "utf8"));
const provenance = { evaluationSetId: config.evaluationSetId,
  runtimeSourceCommit: config.executorFamily.runtimeSourceCommit };
function rows() {
  return config.baselineOrder.map((baselineId, scheduleIndex) => ({
    scheduleIndex, baselineId,
    taskPackId: config.runtimeValidation.taskPackId, scenarioId: config.runtimeValidation.scenarioId,
    status: "failed", eligibleForScientificAnalysis: true,
    cli: config.executorFamily.client, model: config.executorFamily.defaultModel,
    agentCompleted: true, agentExitCode: 0, lastSelectedAction: "finish",
    publicTestExitCode: 1, failure: null, agentError: null,
    successfulHostActionCount: 3, successfulWriteActionCount: 1,
    executedTestActionCount: 1, greenTestActionCount: 0,
    actionCount: 4, writeActionCount: 1, testActionCount: 1, requestCount: 4,
    finalEqualsPreAction: false, finalCorrect: false, evidenceSatisfied: false
  }));
}
function checkpoint(records = rows()) {
  return { evaluationSetId: config.evaluationSetId, adapter: config.executorFamily.adapter,
    repeats: 1, nextCellIndex: records.length, records, infrastructureFailures: [] };
}
function summary(records = rows(), cp = checkpoint(records), source = provenance, issues = []) {
  return evaluateBatch(records, cp, config, source, issues);
}

test("five complete but incorrect cells validate executor, not task success", () => {
  const result = summary();
  assert.equal(result.runtimeValidationPassed, true);
  assert.equal(result.externallyVerifiedSuccessCount, 0);
  assert.equal(result.publicationClaimEligible, false);
});

test("one complete edited cell cannot pass five-cell validation", () => {
  const records = rows().slice(0, 1);
  const result = summary(records);
  assert.equal(result.runtimeValidationPassed, false);
  assert.equal(result.gates.exactlyFiveExpectedCells, false);
});

test("wrong or duplicate baseline identities cannot satisfy the batch", () => {
  const records = rows(); records[4].baselineId = "B0";
  assert.equal(summary(records).runtimeValidationPassed, false);
});

test("native runtime cannot masquerade as JSON-action validation", () => {
  const records = rows(); records[1].cli = "Direct Ollama API tool loop";
  assert.equal(summary(records).gates.matchingRuntimeAndModel, false);
});

test("missing terminal telemetry fails closed", () => {
  const records = rows(); records[2].agentCompleted = null;
  assert.equal(summary(records).runtimeValidationPassed, false);
});

test("finish alone is not an executed host action and failed writes are not successful writes", () => {
  const stats = actionStats({transcript: [
    {step: 1, action: {action: "replace_line_range"}},
    {step: 1, actionResult: {ok: false, error: "out of range"}},
    {step: 2, action: {action: "finish"}}
  ]});
  assert.equal(stats.successfulHostActionCount, 0);
  assert.equal(stats.successfulWriteActionCount, 0);
  const records = rows().map((row) => ({ ...row, ...stats, writeActionCount: 9, finalEqualsPreAction: true }));
  assert.equal(summary(records).gates.observedWriteOrChange, false);
  assert.equal(summary(records).runtimeValidationPassed, false);
});

test("test execution is distinguished from a green test and duplicate results are not double counted", () => {
  const stats = actionStats({transcript: [
    {step: 1, action: {action: "run_public_tests"}},
    {step: 1, actionResult: {ok: true, result: {exitCode: 1}}},
    {step: 1, actionResult: {ok: true, result: {exitCode: 1}}},
    {step: 2, action: {action: "run_public_tests"}},
    {step: 2, actionResult: {ok: true, result: {exitCode: 0}}}
  ]});
  assert.equal(stats.executedTestActionCount, 2);
  assert.equal(stats.greenTestActionCount, 1);
  assert.equal(stats.successfulHostActionCount, 2);
});

test("checkpoint failure history stays visible after an apparently successful retry", () => {
  const cp = checkpoint(); cp.infrastructureFailures.push({scheduleIndex: 0});
  const result = summary(rows(), cp);
  assert.equal(result.infrastructureFailureEventCount, 1);
  assert.equal(result.runtimeValidationPassed, false);
});

test("source errors, missing provenance, and advancing past five block validation", () => {
  assert.equal(summary(rows(), checkpoint(), null).runtimeValidationPassed, false);
  assert.equal(summary(rows(), checkpoint(), provenance, ["unreadable JSON"]).runtimeValidationPassed, false);
  const cp = checkpoint(); cp.nextCellIndex = 6;
  assert.equal(summary(rows(), cp).runtimeValidationPassed, false);
});

test("launcher pins exactly one repeat, five cells, JSON adapter, and model/runtime settings", () => {
  const launch = buildLaunch(config, "results/local/new", {
    PLH_LOCAL_MODEL: "wrong-model", PLH_OLLAMA_NUM_CTX: "123",
    PLH_OLLAMA_BASE_URL: "http://remote.invalid"
  });
  assert.deepEqual(launch.args.slice(-3), ["examples/adapters/direct-ollama-json-actions.json", "1", "5"]);
  assert.equal(launch.env.PLH_LOCAL_MODEL, "qwen3.5:9b");
  assert.equal(launch.env.PLH_OLLAMA_NUM_CTX, "32768");
  assert.equal(launch.env.PLH_OLLAMA_JSON_MAX_STEPS, "20");
  assert.equal(launch.env.PLH_OLLAMA_JSON_REQUEST_TIMEOUT_MS, "120000");
  assert.equal(launch.env.PLH_OLLAMA_JSON_TOTAL_TIMEOUT_MS, "480000");
  assert.equal(launch.env.PLH_OLLAMA_BASE_URL, "http://127.0.0.1:11434");
});

test("git blob digest includes correct byte-length header", () => {
  assert.equal(gitBlobSha(Buffer.alloc(0)), "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
});

async function temp(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "plh-json-validation-"));
  t.after(() => fs.rm(directory, {recursive: true, force: true}));
  return directory;
}

test("launcher refuses an old output directory and retains its evidence", async (t) => {
  const directory = await temp(t);
  const output = await reserveOutput(directory, "results/attempt");
  await fs.writeFile(path.join(output, "evidence.txt"), "retain");
  await assert.rejects(reserveOutput(directory, "results/attempt"), {code: "EEXIST"});
  assert.equal(await fs.readFile(path.join(output, "evidence.txt"), "utf8"), "retain");
  await assert.rejects(reserveOutput(directory, "../escape"), /inside the repository/);
});

test("launcher rejects symlink output parents", async (t) => {
  const directory = await temp(t); const target = await temp(t);
  await fs.symlink(target, path.join(directory, "linked"), "dir");
  await assert.rejects(reserveOutput(directory, "linked/attempt"), /symlink/);
});

test("file summary recovers schedule indices from directories and compares against pre-action source", async (t) => {
  const directory = await temp(t);
  const runRoot = path.join(directory, "run");
  const packRoot = path.join(directory, "examples/artifact-lineage-incident");
  await fs.mkdir(path.join(packRoot, "seed/src"), {recursive: true});
  await fs.writeFile(path.join(packRoot, "task-pack.json"), JSON.stringify({
    taskPackId: "artifact-lineage-incident", seedPath: "seed"
  }));
  await fs.writeFile(path.join(packRoot, "seed/src/artifacts.mjs"), "before");
  await fs.mkdir(runRoot);
  await fs.writeFile(path.join(runRoot, "ontology-stress-checkpoint.json"), JSON.stringify(checkpoint()));
  await fs.writeFile(path.join(runRoot, "json-action-validation-provenance.json"), JSON.stringify(provenance));
  for (const row of rows()) {
    const cellRoot = path.join(runRoot, "cells", String(row.scheduleIndex).padStart(3, "0"),
      row.taskPackId, row.scenarioId, row.baselineId);
    await fs.mkdir(path.join(cellRoot, "execution"), {recursive: true});
    await fs.mkdir(path.join(cellRoot, "workspace/src"), {recursive: true});
    // Production cell result does not contain scheduleIndex.
    const { scheduleIndex, ...cell } = row;
    await fs.writeFile(path.join(cellRoot, "ontology-stress-cell-result.json"), JSON.stringify(cell));
    await fs.writeFile(path.join(cellRoot, "workspace/src/artifacts.mjs"), "after");
    await fs.writeFile(path.join(cellRoot, "execution/provider-wrapper-telemetry.json"), JSON.stringify({
      ...row, requestedModel: row.model,
      transcript: [
        {step: 1, action: {action: "replace_line_range"}},
        {step: 1, actionResult: {ok: true}},
        {step: 2, action: {action: "finish"}}
      ]
    }));
  }
  const result = await summarizeRun(runRoot, config, directory);
  assert.equal(result.runtimeValidationPassed, true);
  assert.deepEqual(result.records.map((row) => row.scheduleIndex), [0, 1, 2, 3, 4]);
  assert.equal(result.changedFromPreActionCells, 5);
  // Truncated evidence cannot count as a completed cell.
  const file = path.join(runRoot, "cells/004/artifact-lineage-incident/artifact-lineage-clean-v2/P/ontology-stress-cell-result.json");
  await fs.writeFile(file, "{");
  assert.equal((await summarizeRun(runRoot, config, directory)).runtimeValidationPassed, false);
});

test("new condition preserves the original task, profile, ontology, and schedule fields", async () => {
  const prior = JSON.parse(await fs.readFile(new URL(config.scheduleSource, root), "utf8"));
  for (const key of ["prospectiveTaskPacks", "taskProfiles", "baselineOrder", "scenarioClasses",
    "analysisPlan", "cellRunner", "ontologyConfig"]) {
    assert.deepEqual(config[key], prior[key], key);
  }
});
