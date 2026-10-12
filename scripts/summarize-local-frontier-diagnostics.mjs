import fs from "node:fs/promises";
import path from "node:path";

const outArg = process.argv[2];
if (!outArg) {
  process.stderr.write(
    "usage: node summarize-local-frontier-diagnostics.mjs <runDir>\n"
  );
  process.exit(2);
}

const root = path.resolve(outArg);
const cellsRoot = path.join(root, "cells");

async function walk(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else out.push(full);
  }
  return out;
}

const files = await walk(cellsRoot);
const cellFiles = files.filter((p) =>
  p.endsWith("ontology-stress-cell-result.json")
);

const rows = [];

for (const cellFile of cellFiles) {
  const cell = JSON.parse(await fs.readFile(cellFile, "utf8"));
  const cellDir = path.dirname(cellFile);
  const telemetryPath = path.join(
    cellDir,
    "execution",
    "provider-wrapper-telemetry.json"
  );

  let telemetry = null;
  try {
    telemetry = JSON.parse(
      await fs.readFile(telemetryPath, "utf8")
    );
  } catch {}

  const graderChecks =
    cell?.final?.grade?.checks ?? [];
  const failedGraderChecks = graderChecks
    .filter((check) => check.ok !== true)
    .map((check) => ({
      name: check.name,
      error: check.error ?? null
    }));

  let failureStage = "success";
  if (cell?.final?.correct !== true) {
    if (telemetry?.agentExitCode != null &&
        telemetry.agentExitCode !== 0) {
      failureStage = "agent_process";
    } else if (
      telemetry?.publicTestExitCode != null &&
      telemetry.publicTestExitCode !== 0
    ) {
      failureStage = "public_test";
    } else if (
      cell?.execution?.status != null &&
      cell.execution.status !== "completed"
    ) {
      failureStage = "agent_reported_failure";
    } else {
      failureStage = "external_grader_only";
    }
  }

  rows.push({
    taskPackId: cell.taskPackId,
    scenarioId: cell.scenarioId,
    scenarioClass: cell.scenarioClass,
    baselineId: cell.baselineId,
    finalCorrect: cell?.final?.correct === true,
    evidenceSatisfied:
      cell?.final?.evidenceSatisfied === true,
    failureStage,
    executionStatus: cell?.execution?.status ?? null,
    agentExitCode: telemetry?.agentExitCode ?? null,
    publicTestExitCode:
      telemetry?.publicTestExitCode ?? null,
    requestedModel: telemetry?.requestedModel ?? null,
    cliVersion: telemetry?.cliVersion ?? null,
    ollamaVersion: telemetry?.ollamaVersion ?? null,
    selectedWorkerId:
      cell?.coordination?.selectedWorkerId ?? null,
    contextKinds:
      cell?.coordination?.contextKinds ?? [],
    failedGraderChecks
  });
}

rows.sort((a, b) =>
  a.taskPackId.localeCompare(b.taskPackId) ||
  a.scenarioId.localeCompare(b.scenarioId) ||
  a.baselineId.localeCompare(b.baselineId)
);

function countBy(values, keyFn) {
  const out = {};
  for (const item of values) {
    const key = keyFn(item);
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

const summary = {
  schemaVersion: 1,
  runDir: outArg,
  runCount: rows.length,
  modelTags: [...new Set(
    rows.map((r) => r.requestedModel).filter(Boolean)
  )],
  failureStageCounts: countBy(
    rows,
    (r) => r.failureStage
  ),
  failureStageByBaseline: Object.fromEntries(
    [...new Set(rows.map((r) => r.baselineId))]
      .sort()
      .map((baselineId) => [
        baselineId,
        countBy(
          rows.filter((r) => r.baselineId === baselineId),
          (r) => r.failureStage
        )
      ])
  ),
  failedGraderCheckCounts: countBy(
    rows.flatMap((r) =>
      r.failedGraderChecks.map((check) => check.name)
    ),
    (name) => name
  ),
  records: rows
};

const outputPath = path.join(
  root,
  "local-frontier-diagnostics.json"
);
await fs.writeFile(
  outputPath,
  JSON.stringify(summary, null, 2) + "\n"
);
process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
