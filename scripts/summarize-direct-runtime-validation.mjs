import fs from "node:fs/promises";
import path from "node:path";

const runArg = process.argv[2];
const evalArg = process.argv[3];

if (!runArg || !evalArg) {
  process.stderr.write(
    "usage: node summarize-direct-runtime-validation.mjs <runDir> <evalSet.json>\n"
  );
  process.exit(2);
}

const root = process.cwd();
const runRoot = path.resolve(root, runArg);
const evalSet = JSON.parse(
  await fs.readFile(path.resolve(root, evalArg), "utf8")
);

async function walk(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else out.push(full);
  }
  return out;
}

const taskPackById = new Map();
for (const entry of evalSet.prospectiveTaskPacks ?? []) {
  const manifestPath = path.resolve(root, entry.taskPack);
  const manifest = JSON.parse(
    await fs.readFile(manifestPath, "utf8")
  );
  taskPackById.set(manifest.taskPackId, {
    manifest,
    packRoot: path.dirname(manifestPath),
    profile: evalSet.taskProfiles?.[manifest.taskPackId]
  });
}

const cellsRoot = path.join(runRoot, "cells");
const files = await walk(cellsRoot);
const cellFiles = files.filter((file) => {
  if (!file.endsWith("ontology-stress-cell-result.json")) return false;
  const relative = path.relative(cellsRoot, file);
  return relative.split(path.sep).length === 5;
});

const records = [];

for (const cellFile of cellFiles) {
  const cellRoot = path.dirname(cellFile);
  const cell = JSON.parse(await fs.readFile(cellFile, "utf8"));
  const task = taskPackById.get(cell.taskPackId);

  let telemetry = null;
  try {
    telemetry = JSON.parse(
      await fs.readFile(
        path.join(
          cellRoot,
          "execution",
          "provider-wrapper-telemetry.json"
        ),
        "utf8"
      )
    );
  } catch {}

  let finalEqualsPreAction = null;

  if (task?.profile?.implementationPath) {
    const finalPath = path.join(
      cellRoot,
      "workspace",
      task.profile.implementationPath
    );
    const seedPath = path.join(
      task.packRoot,
      task.manifest.seedPath,
      task.profile.implementationPath
    );
    const preActionPath =
      cell?.initialPreparation?.referenceApplied === true &&
      typeof cell?.initialPreparation?.referenceSource === "string"
        ? path.join(
            task.packRoot,
            cell.initialPreparation.referenceSource
          )
        : seedPath;

    try {
      const [finalText, preActionText] = await Promise.all([
        fs.readFile(finalPath, "utf8"),
        fs.readFile(preActionPath, "utf8")
      ]);
      finalEqualsPreAction = finalText === preActionText;
    } catch {}
  }

  records.push({
    scheduleIndex: cell.scheduleIndex ?? null,
    taskPackId: cell.taskPackId,
    scenarioId: cell.scenarioId,
    baselineId: cell.baselineId,
    status: cell.status,
    finalCorrect: cell?.final?.correct === true,
    evidenceSatisfied: cell?.final?.evidenceSatisfied === true,
    selectedWorkerId:
      cell?.coordination?.selectedWorkerId ?? null,
    selectedRoleId:
      cell?.coordination?.selectedRoleId ?? null,
    toolCallCount: telemetry?.toolCallCount ?? null,
    writeToolCallCount:
      telemetry?.writeToolCallCount ?? null,
    parserRetryCount:
      telemetry?.parserRetryCount ?? 0,
    testToolCallCount:
      telemetry?.testToolCallCount ?? null,
    agentTurns: telemetry?.agentTurns ?? null,
    agentCompleted:
      telemetry?.agentCompleted ?? null,
    publicTestExitCode:
      telemetry?.publicTestExitCode ?? null,
    finalEqualsPreAction
  });
}

records.sort(
  (a, b) =>
    (a.scheduleIndex ?? 1e9) -
    (b.scheduleIndex ?? 1e9)
);

const totalToolCalls = records.reduce(
  (sum, record) =>
    sum + (record.toolCallCount ?? 0),
  0
);
const totalWriteToolCalls = records.reduce(
  (sum, record) =>
    sum + (record.writeToolCallCount ?? 0),
  0
);
const totalParserRetries = records.reduce(
  (sum, record) =>
    sum + (record.parserRetryCount ?? 0),
  0
);
const changedCells = records.filter(
  (record) => record.finalEqualsPreAction === false
).length;
const infrastructureFailures = records.filter(
  (record) =>
    record.status === "infrastructure_failed" ||
    record.agentCompleted === false
).length;

const pass =
  records.length > 0 &&
  infrastructureFailures === 0 &&
  totalToolCalls > 0 &&
  (
    totalWriteToolCalls > 0 ||
    changedCells > 0
  );

const summary = {
  schemaVersion: 1,
  runDir: runArg,
  runCount: records.length,
  totalToolCalls,
  totalWriteToolCalls,
  totalParserRetries,
  changedFromPreActionCells: changedCells,
  externallyVerifiedSuccessCount:
    records.filter(
      (record) => record.evidenceSatisfied
    ).length,
  infrastructureFailureCount:
    infrastructureFailures,
  runtimeValidationPassed: pass,
  records
};

const outputPath = path.join(
  runRoot,
  "direct-runtime-validation-summary.json"
);

await fs.writeFile(
  outputPath,
  JSON.stringify(summary, null, 2) + "\n"
);

process.stdout.write(
  JSON.stringify(summary, null, 2) + "\n"
);
