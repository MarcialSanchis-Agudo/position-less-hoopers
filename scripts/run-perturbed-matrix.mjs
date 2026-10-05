import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const manifestArg = process.argv[2];
const outArg = process.argv[3];
const adapterArg = process.argv[4];

if (!manifestArg || !outArg || !adapterArg) {
  process.stderr.write(
    "usage: node run-perturbed-matrix.mjs <task-pack.json> <outDir> <adapter.json>\n"
  );
  process.exit(2);
}

const prepareScript = path.join(root, "scripts/prepare-task-pack.mjs");
const cellScript = path.join(root, "scripts/run-perturbed-cell.mjs");

const prep = spawnSync(
  process.execPath,
  [prepareScript, manifestArg, outArg],
  { cwd: root, encoding: "utf8" }
);

if (prep.status !== 0) {
  process.stderr.write(prep.stderr || prep.stdout);
  process.exit(prep.status ?? 1);
}

const outRoot = path.resolve(root, outArg);
const index = JSON.parse(
  await fs.readFile(path.join(outRoot, "index.json"), "utf8")
);

const perturbedRuns = index.runs.filter(
  (run) => run.scenarioKind === "perturbed"
);

const rows = [];

for (const run of perturbedRuns) {
  const runRoot = path.join(outRoot, run.scenarioId, run.policy);
  const processResult = spawnSync(
    process.execPath,
    [
      cellScript,
      path.relative(root, runRoot),
      adapterArg
    ],
    { cwd: root, encoding: "utf8" }
  );

  let record = null;
  try {
    record = JSON.parse(
      await fs.readFile(
        path.join(runRoot, "perturbed-result.json"),
        "utf8"
      )
    );
  } catch {}

  rows.push({
    taskPackId: run.taskPackId,
    scenarioId: run.scenarioId,
    policy: run.policy,
    perturbationType: run.perturbation?.type ?? null,
    processExitCode: processResult.status,
    status: record?.status ?? null,
    eligibleForScientificAnalysis:
      record?.eligibleForScientificAnalysis ?? false,
    initialCorrect: record?.phase1?.gradeCorrect ?? null,
    postPerturbationCorrect:
      record?.perturbation?.postPerturbationGradeCorrect ?? null,
    recoveryExecuted: record?.recovery?.executed ?? false,
    recoveryLatencyMs:
      record?.recovery?.completionLatencyMs ?? null,
    finalCorrect:
      record?.finalCell?.externalCorrect ?? false,
    evidenceSatisfied:
      record?.finalCell?.evidenceSatisfied ?? false,
    exclusionReason: record?.exclusionReason ?? null
  });
}

const analyzable = rows.filter(
  (row) => row.eligibleForScientificAnalysis
);

const byPolicy = Object.values(
  analyzable.reduce((acc, row) => {
    const current = acc[row.policy] ?? {
      policy: row.policy,
      runCount: 0,
      recoverySuccessCount: 0,
      totalRecoveryLatencyMs: 0,
      recoveryLatencySamples: 0
    };

    current.runCount += 1;
    if (row.finalCorrect && row.evidenceSatisfied) {
      current.recoverySuccessCount += 1;
    }
    if (Number.isFinite(row.recoveryLatencyMs)) {
      current.totalRecoveryLatencyMs += row.recoveryLatencyMs;
      current.recoveryLatencySamples += 1;
    }

    acc[row.policy] = current;
    return acc;
  }, {})
).map((row) => ({
  policy: row.policy,
  runCount: row.runCount,
  recoverySuccessCount: row.recoverySuccessCount,
  recoverySuccessRate:
    row.runCount ? row.recoverySuccessCount / row.runCount : null,
  meanRecoveryLatencyMs:
    row.recoveryLatencySamples
      ? row.totalRecoveryLatencyMs / row.recoveryLatencySamples
      : null
}));

const summary = {
  schemaVersion: 1,
  taskPackId: index.taskPackId,
  adapter: adapterArg,
  runCount: rows.length,
  analyzableRunCount: analyzable.length,
  excludedRunCount: rows.length - analyzable.length,
  rows,
  byPolicy
};

await fs.writeFile(
  path.join(outRoot, "perturbed-matrix-summary.json"),
  JSON.stringify(summary, null, 2) + "\n"
);

process.stdout.write(JSON.stringify(summary, null, 2) + "\n");

const infrastructureFailures = rows.filter(
  (row) =>
    row.status == null ||
    (row.eligibleForScientificAnalysis === true &&
      row.initialCorrect !== true)
).length;

process.exit(infrastructureFailures === 0 ? 0 : 1);

