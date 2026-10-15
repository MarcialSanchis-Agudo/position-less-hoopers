import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EVAL_PATH } from "./run-json-action-runtime-validation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WRITES = new Set(["write_text_file", "replace_line_range", "replace_text_in_file"]);

export function actionStats(telemetry) {
  const transcript = Array.isArray(telemetry?.transcript) ? telemetry.transcript : [];
  const selected = new Map();
  const completed = new Set();
  let successfulHostActionCount = 0;
  let successfulWriteActionCount = 0;
  let executedTestActionCount = 0;
  let greenTestActionCount = 0;
  for (const item of transcript) {
    if (item?.action) selected.set(item.step, item.action.action);
    if (!item?.actionResult || !selected.has(item.step) || completed.has(item.step)) continue;
    completed.add(item.step);
    const action = selected.get(item.step);
    if (item.actionResult.ok !== true || action === "finish") continue;
    successfulHostActionCount += 1;
    if (WRITES.has(action)) successfulWriteActionCount += 1;
    if (action === "run_public_tests" && Number.isInteger(item.actionResult.result?.exitCode)) {
      executedTestActionCount += 1;
      if (item.actionResult.result.exitCode === 0) greenTestActionCount += 1;
    }
  }
  return {
    successfulHostActionCount, successfulWriteActionCount,
    executedTestActionCount, greenTestActionCount,
    lastSelectedAction: [...selected.values()].at(-1) ?? null
  };
}

export function evaluateBatch(records, checkpoint, config, provenance, sourceIssues = []) {
  const expected = config.baselineOrder;
  const count = config.runtimeValidation.firstBatchCells;
  const historyFailures = Array.isArray(checkpoint?.infrastructureFailures)
    ? checkpoint.infrastructureFailures : [];
  const isIdentity = (row, index) => row?.scheduleIndex === index &&
    row.baselineId === expected[index] &&
    row.taskPackId === config.runtimeValidation.taskPackId &&
    row.scenarioId === config.runtimeValidation.scenarioId;
  const infrastructureFailureCount = records.filter((row) =>
    row.status === "infrastructure_failed" || row.agentCompleted === false ||
    (row.agentExitCode != null && row.agentExitCode !== 0) ||
    row.failure != null || row.agentError != null).length;
  const sum = (key) => records.reduce((n, row) => n + (Number.isFinite(row[key]) ? row[key] : 0), 0);
  const changedFromPreActionCells = records.filter((row) => row.finalEqualsPreAction === false).length;
  const gates = {
    exactlyFiveExpectedCells: count === 5 && records.length === count && records.every(isIdentity),
    checkpointCompleteForBatch: checkpoint?.evaluationSetId === config.evaluationSetId &&
      checkpoint?.adapter === config.executorFamily.adapter && checkpoint?.repeats === 1 &&
      checkpoint?.nextCellIndex === count && checkpoint?.records?.length === count &&
      checkpoint.records.every((row, index) => isIdentity(row, index) && row.eligibleForScientificAnalysis === true),
    allCellsAnalyzable: records.length === count && records.every((row) =>
      row.eligibleForScientificAnalysis === true && ["succeeded", "failed"].includes(row.status)),
    matchingRuntimeAndModel: records.length === count && records.every((row) =>
      row.cli === config.executorFamily.client && row.model === config.executorFamily.defaultModel),
    allAgentsCompleted: records.length === count && records.every((row) =>
      row.agentCompleted === true && row.agentExitCode === 0 &&
      row.lastSelectedAction === "finish" && row.failure == null && row.agentError == null &&
      Number.isInteger(row.publicTestExitCode)),
    realHostActionsInEveryCell: records.length === count && records.every((row) => row.successfulHostActionCount > 0),
    observedWriteOrChange: sum("successfulWriteActionCount") > 0 || changedFromPreActionCells > 0,
    noInfrastructureFailures: infrastructureFailureCount === 0 && historyFailures.length === 0,
    provenancePresent: provenance?.evaluationSetId === config.evaluationSetId &&
      provenance?.runtimeSourceCommit === config.executorFamily.runtimeSourceCommit,
    readableEvidence: sourceIssues.length === 0
  };
  return {
    schemaVersion: 1,
    evaluationSetId: config.evaluationSetId,
    runtime: config.executorFamily.runtime,
    developmentOnly: true,
    publicationClaimEligible: false,
    expectedCellCount: count,
    runCount: records.length,
    totalActions: sum("actionCount"),
    totalWriteActions: sum("writeActionCount"),
    totalTestActions: sum("testActionCount"),
    totalRequests: sum("requestCount"),
    totalSuccessfulHostActions: sum("successfulHostActionCount"),
    totalSuccessfulWriteActions: sum("successfulWriteActionCount"),
    totalExecutedTestActions: sum("executedTestActionCount"),
    totalGreenTestActions: sum("greenTestActionCount"),
    changedFromPreActionCells,
    externallyVerifiedSuccessCount: records.filter((row) => row.eligibleForScientificAnalysis === true &&
      row.finalCorrect === true && row.evidenceSatisfied === true).length,
    infrastructureFailureCount,
    infrastructureFailureEventCount: historyFailures.length,
    runtimeValidationPassed: Object.values(gates).every(Boolean),
    gates,
    failedGates: Object.keys(gates).filter((key) => !gates[key]),
    sourceIssues,
    records
  };
}

export async function summarizeRun(runRoot, config, root = ROOT) {
  const issues = [];
  async function json(file) {
    try { return JSON.parse(await fs.readFile(file, "utf8")); }
    catch (error) {
      if (error.code !== "ENOENT") issues.push(`${path.relative(runRoot, file)}: ${error.message}`);
      return null;
    }
  }
  const checkpoint = await json(path.join(runRoot, "ontology-stress-checkpoint.json"));
  const provenance = await json(path.join(runRoot, "json-action-validation-provenance.json"));
  let entries = [];
  try { entries = await fs.readdir(path.join(runRoot, "cells")); }
  catch (error) { if (error.code !== "ENOENT") issues.push(error.message); }
  const allowed = config.baselineOrder.map((_, i) => String(i).padStart(3, "0"));
  if (entries.some((entry) => !allowed.includes(entry))) issues.push("Unexpected cells outside first five");
  const taskEntry = config.prospectiveTaskPacks.find((entry) =>
    path.basename(path.dirname(entry.taskPack)) === config.runtimeValidation.taskPackId);
  if (!taskEntry) throw new Error("TaskPack missing from validation configuration");
  const manifestPath = path.resolve(root, taskEntry.taskPack);
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const packRoot = path.dirname(manifestPath);
  const implementationPath = config.taskProfiles[manifest.taskPackId].implementationPath;
  const records = [];
  for (let index = 0; index < allowed.length; index += 1) {
    if (!entries.includes(allowed[index])) continue;
    const baselineId = config.baselineOrder[index];
    const cellRoot = path.join(runRoot, "cells", allowed[index], manifest.taskPackId,
      config.runtimeValidation.scenarioId, baselineId);
    const cell = await json(path.join(cellRoot, "ontology-stress-cell-result.json"));
    const telemetry = await json(path.join(cellRoot, "execution", "provider-wrapper-telemetry.json"));
    if (!cell) issues.push(`Cell ${index}: missing or unreadable cell result`);
    if (!telemetry) issues.push(`Cell ${index}: missing or unreadable telemetry`);
    if (cell && (cell.taskPackId !== manifest.taskPackId ||
        cell.scenarioId !== config.runtimeValidation.scenarioId || cell.baselineId !== baselineId)) {
      issues.push(`Cell ${index}: result identity disagrees with scheduled path`);
    }
    let finalEqualsPreAction = null;
    if (cell) {
      const preActionPath = cell.initialPreparation?.referenceApplied === true &&
        typeof cell.initialPreparation?.referenceSource === "string"
        ? path.join(packRoot, cell.initialPreparation.referenceSource)
        : path.join(packRoot, manifest.seedPath, implementationPath);
      try {
        const [finalText, preText] = await Promise.all([
          fs.readFile(path.join(cellRoot, "workspace", implementationPath), "utf8"),
          fs.readFile(preActionPath, "utf8")
        ]);
        finalEqualsPreAction = finalText === preText;
      } catch (error) { issues.push(`Cell ${index}: cannot compare implementation: ${error.message}`); }
    }
    records.push({
      scheduleIndex: index, taskPackId: cell?.taskPackId ?? manifest.taskPackId,
      scenarioId: cell?.scenarioId ?? config.runtimeValidation.scenarioId,
      baselineId: cell?.baselineId ?? baselineId, status: cell?.status ?? "missing_result",
      eligibleForScientificAnalysis: cell?.eligibleForScientificAnalysis === true,
      model: telemetry?.requestedModel ?? null, cli: telemetry?.cli ?? null,
      actionCount: telemetry?.actionCount ?? null, writeActionCount: telemetry?.writeActionCount ?? null,
      testActionCount: telemetry?.testActionCount ?? null, requestCount: telemetry?.requestCount ?? null,
      agentSteps: telemetry?.agentSteps ?? null, agentCompleted: telemetry?.agentCompleted ?? null,
      agentExitCode: telemetry?.agentExitCode ?? null, publicTestExitCode: telemetry?.publicTestExitCode ?? null,
      phase: telemetry?.phase ?? null, failure: telemetry?.failure ?? null,
      agentError: telemetry?.agentError ?? null, lastRequest: telemetry?.lastRequest ?? null,
      durationMs: telemetry?.durationMs ?? null,
      ...actionStats(telemetry), finalEqualsPreAction,
      finalCorrect: cell?.final?.correct === true, evidenceSatisfied: cell?.final?.evidenceSatisfied === true,
      selectedWorkerId: cell?.coordination?.selectedWorkerId ?? null,
      selectedRoleId: cell?.coordination?.selectedRoleId ?? null
    });
  }
  return { ...evaluateBatch(records, checkpoint, config, provenance, issues), runDir: runRoot };
}

async function main() {
  if (!process.argv[2] || process.argv.length !== 3) {
    throw new Error("usage: node scripts/summarize-json-action-runtime-validation.mjs <runDir>");
  }
  const runRoot = path.resolve(process.argv[2]);
  const config = JSON.parse(await fs.readFile(path.join(ROOT, EVAL_PATH), "utf8"));
  const summary = await summarizeRun(runRoot, config);
  const file = path.join(runRoot, "json-action-runtime-validation-summary.json");
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(summary, null, 2) + "\n");
  await fs.rename(temporary, file);
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = summary.runtimeValidationPassed ? 0 : 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
