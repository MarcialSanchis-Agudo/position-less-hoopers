import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

export const EVAL_PATH = "benchmarks/courtshift/local-json-action-runtime-validation-eval-v0.1.2-qwen35-9b.json";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function toolErrorStats(telemetry) {
  const selected = new Map();
  const seen = new Set();
  const errors = [];
  for (const item of telemetry?.transcript ?? []) {
    if (item?.action) selected.set(item.step, item.action);
    if (!item?.actionResult || !selected.has(item.step) || seen.has(item.step)) continue;
    seen.add(item.step);
    if (item.actionResult.ok !== false) continue;
    const action = selected.get(item.step);
    errors.push({step: item.step, action: action.action, path: action.path ?? null,
      error: String(item.actionResult.error ?? "Unknown host action error")});
  }
  return {toolErrorCount: errors.length,
    pathRejectionCount: errors.filter((row) => /absolute paths|path escapes workspace/.test(row.error)).length,
    toolErrors: errors};
}

// These diagnostics do not change the frozen cell's classification or rerun its grader.
export function enhanceSummary(summary, telemetryByIndex, cellsByIndex, provenance, config, issues = []) {
  const records = summary.records.map((row) => {
    const telemetry = telemetryByIndex.get(row.scheduleIndex);
    const cell = cellsByIndex.get(row.scheduleIndex);
    const finalGradeAvailable = typeof cell?.final?.correct === "boolean";
    return {...row, pathContractVersion: telemetry?.pathContractVersion ?? null,
      ...toolErrorStats(telemetry), finalGradeAvailable,
      finalCorrect: finalGradeAvailable ? cell.final.correct : null,
      evidenceSatisfied: finalGradeAvailable && typeof cell.final.evidenceSatisfied === "boolean"
        ? cell.final.evidenceSatisfied : null};
  });
  const sourceIssues = [...summary.sourceIssues, ...issues];
  const gates = {...summary.gates,
    readableEvidence: sourceIssues.length === 0,
    matchingWorkspacePathContract: records.length === config.runtimeValidation.firstBatchCells &&
      records.every((row) => row.pathContractVersion === config.executorFamily.pathContractVersion),
    frozenRuntimeProvenanceMatches:
      provenance?.evaluationSetId === config.evaluationSetId &&
      provenance?.runtimeSourceCommit === config.executorFamily.runtimeSourceCommit &&
      provenance?.pathContractVersion === config.executorFamily.pathContractVersion &&
      isDeepStrictEqual(provenance?.runtimeBlobs, config.executorFamily.runtimeBlobs)};
  return {...summary, records, sourceIssues, gates,
    totalToolErrors: records.reduce((n, row) => n + row.toolErrorCount, 0),
    totalPathRejections: records.reduce((n, row) => n + row.pathRejectionCount, 0),
    externalGradeAvailableCount: records.filter((row) => row.finalGradeAvailable).length,
    runtimeValidationPassed: Object.values(gates).every(Boolean),
    failedGates: Object.keys(gates).filter((key) => !gates[key]),
    observedDiagnostics: {
      missingBaselines: config.baselineOrder.filter((id) => !records.some((row) => row.baselineId === id)),
      runtimeModelMismatches: records.filter((row) => row.cli !== config.executorFamily.client ||
        row.model !== config.executorFamily.defaultModel).map((row) => row.baselineId),
      pathContractMismatches: records.filter((row) => row.pathContractVersion !== config.executorFamily.pathContractVersion)
        .map((row) => row.baselineId),
      incompleteAgents: records.filter((row) => row.agentCompleted !== true).map((row) => row.baselineId),
      cellsWithoutSuccessfulHostActions: records.filter((row) => !(row.successfulHostActionCount > 0))
        .map((row) => row.baselineId)
    }};
}

export async function summarizeV012(runRoot, config, root = ROOT) {
  const { summarizeRun } = await import("./summarize-json-action-runtime-validation.mjs");
  const base = await summarizeRun(runRoot, config, root);
  const telemetry = new Map();
  const cells = new Map();
  const issues = [];
  async function readJson(file) {
    try { return JSON.parse(await fs.readFile(file, "utf8")); }
    catch (error) { issues.push(`${path.relative(runRoot, file)}: ${error.message}`); return null; }
  }
  for (const row of base.records) {
    const cellRoot = path.join(runRoot, "cells", String(row.scheduleIndex).padStart(3, "0"),
      config.runtimeValidation.taskPackId, config.runtimeValidation.scenarioId, config.baselineOrder[row.scheduleIndex]);
    telemetry.set(row.scheduleIndex, await readJson(path.join(cellRoot, "execution/provider-wrapper-telemetry.json")));
    cells.set(row.scheduleIndex, await readJson(path.join(cellRoot, "ontology-stress-cell-result.json")));
  }
  const provenance = await readJson(path.join(runRoot, "json-action-validation-provenance.json"));
  return enhanceSummary(base, telemetry, cells, provenance, config, issues);
}

export async function writeSummary(runRoot, config, root = ROOT) {
  const summary = await summarizeV012(runRoot, config, root);
  const file = path.join(runRoot, "json-action-runtime-validation-summary.json");
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(summary, null, 2) + "\n");
  await fs.rename(temp, file);
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  (async () => {
    if (process.argv.length !== 3) throw new Error("usage: node scripts/summarize-json-action-runtime-validation-v0.1.2.mjs <runDir>");
    const config = JSON.parse(await fs.readFile(path.join(ROOT, EVAL_PATH), "utf8"));
    const summary = await writeSummary(path.resolve(process.argv[2]), config);
    console.log(JSON.stringify(summary, null, 2));
    process.exitCode = summary.runtimeValidationPassed ? 0 : 1;
  })().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
