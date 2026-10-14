import fs from "node:fs/promises";
import path from "node:path";

const runArg = process.argv[2];
const evalArg = process.argv[3];

if (!runArg || !evalArg) {
  process.stderr.write(
    "usage: node summarize-local-evidence-loop.mjs <runDir> <evalSet.json>\n"
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

function failedCheckNames(grade) {
  return (grade?.checks ?? [])
    .filter((check) => check?.ok !== true)
    .map((check) => String(check.name))
    .sort();
}

function sameStrings(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function mean(values) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) /
        values.length
    : null;
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

const files = await walk(path.join(runRoot, "cells"));
const cellFiles = files.filter((file) =>
  file.endsWith("ontology-stress-cell-result.json")
);

const records = [];

for (const cellFile of cellFiles) {
  const cell = JSON.parse(await fs.readFile(cellFile, "utf8"));
  const attempts = cell?.evidenceLoop?.attempts ?? [];
  const first = attempts[0] ?? null;
  const last = attempts.at(-1) ?? null;

  const firstFailed = failedCheckNames(first?.grade);
  const finalFailed = failedCheckNames(last?.grade ?? cell?.final?.grade);

  const workerSequence = attempts.map(
    (attempt) =>
      attempt?.coordination?.selectedWorkerId ?? null
  );
  const roleSequence = attempts.map(
    (attempt) =>
      attempt?.coordination?.selectedRoleId ?? null
  );
  const contextSequence = attempts.map(
    (attempt) =>
      attempt?.coordination?.contextKinds ?? []
  );
  const failedCheckSequence = attempts.map(
    (attempt) => failedCheckNames(attempt?.grade)
  );

  const task = taskPackById.get(cell.taskPackId);
  let finalEqualsPreAction = null;

  if (task?.profile?.implementationPath) {
    const cellRoot = path.dirname(cellFile);
    const workspace = path.join(cellRoot, "workspace");
    const finalPath = path.join(
      workspace,
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
      finalEqualsPreAction =
        finalText === preActionText;
    } catch {
      finalEqualsPreAction = null;
    }
  }

  records.push({
    taskPackId: cell.taskPackId,
    scenarioId: cell.scenarioId,
    scenarioClass: cell.scenarioClass,
    baselineId: cell.baselineId,
    status: cell.status,
    finalCorrect: cell?.final?.correct === true,
    evidenceSatisfied:
      cell?.final?.evidenceSatisfied === true,
    attemptCount: attempts.length,
    stoppedReason:
      cell?.evidenceLoop?.stoppedReason ?? null,
    firstFailedCheckCount: firstFailed.length,
    finalFailedCheckCount: finalFailed.length,
    reducedFailedCheckCount:
      finalFailed.length < firstFailed.length,
    changedFailedCheckSet:
      !sameStrings(firstFailed, finalFailed),
    firstFailedChecks: firstFailed,
    finalFailedChecks: finalFailed,
    workerSequence,
    roleSequence,
    contextSequence,
    failedCheckSequence,
    workerChangedAfterAttempt1:
      workerSequence.slice(1).some(
        (worker) => worker !== workerSequence[0]
      ),
    contextChangedAfterAttempt1:
      contextSequence.slice(1).some(
        (contexts) =>
          !sameStrings(contexts, contextSequence[0])
      ),
    finalEqualsPreAction
  });
}

records.sort((a, b) =>
  a.taskPackId.localeCompare(b.taskPackId) ||
  a.scenarioId.localeCompare(b.scenarioId) ||
  a.baselineId.localeCompare(b.baselineId)
);

const baselines = [...new Set(
  records.map((record) => record.baselineId)
)].sort();

const summary = {
  schemaVersion: 1,
  runDir: runArg,
  runCount: records.length,
  totalAttemptCount: records.reduce(
    (sum, record) => sum + record.attemptCount,
    0
  ),
  attemptCountDistribution: Object.fromEntries(
    [...new Set(records.map((record) => record.attemptCount))]
      .sort((a, b) => a - b)
      .map((attemptCount) => [
        String(attemptCount),
        records.filter(
          (record) => record.attemptCount === attemptCount
        ).length
      ])
  ),
  successCount: records.filter(
    (record) => record.evidenceSatisfied
  ).length,
  reducedFailedCheckCountCells: records.filter(
    (record) => record.reducedFailedCheckCount
  ).length,
  changedFailedCheckSetCells: records.filter(
    (record) => record.changedFailedCheckSet
  ).length,
  workerChangedAfterAttempt1Cells: records.filter(
    (record) => record.workerChangedAfterAttempt1
  ).length,
  contextChangedAfterAttempt1Cells: records.filter(
    (record) => record.contextChangedAfterAttempt1
  ).length,
  finalChangedFromPreActionCells: records.filter(
    (record) => record.finalEqualsPreAction === false
  ).length,
  finalEqualsPreActionCells: records.filter(
    (record) => record.finalEqualsPreAction === true
  ).length,
  byBaseline: Object.fromEntries(
    baselines.map((baselineId) => {
      const subset = records.filter(
        (record) => record.baselineId === baselineId
      );
      return [
        baselineId,
        {
          runCount: subset.length,
          successCount: subset.filter(
            (record) => record.evidenceSatisfied
          ).length,
          meanAttemptCount: mean(
            subset.map((record) => record.attemptCount)
          ),
          reducedFailedCheckCountCells:
            subset.filter(
              (record) => record.reducedFailedCheckCount
            ).length,
          changedFailedCheckSetCells:
            subset.filter(
              (record) => record.changedFailedCheckSet
            ).length,
          workerChangedAfterAttempt1Cells:
            subset.filter(
              (record) =>
                record.workerChangedAfterAttempt1
            ).length,
          contextChangedAfterAttempt1Cells:
            subset.filter(
              (record) =>
                record.contextChangedAfterAttempt1
            ).length,
          finalChangedFromPreActionCells:
            subset.filter(
              (record) =>
                record.finalEqualsPreAction === false
            ).length
        }
      ];
    })
  ),
  stressRecords: records.filter(
    (record) =>
      record.scenarioClass ===
      "ontology_stress_contract_mutation"
  ),
  records
};

const outputPath = path.join(
  runRoot,
  "local-evidence-loop-diagnostics.json"
);

await fs.writeFile(
  outputPath,
  JSON.stringify(summary, null, 2) + "\n"
);

process.stdout.write(
  JSON.stringify(summary, null, 2) + "\n"
);
