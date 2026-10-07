import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const evalSetArg = process.argv[2];
const ontologyArg = process.argv[3];
const outArg = process.argv[4];
const adapterArg = process.argv[5];
const repeatsArg = process.argv[6] ?? null;

if (!evalSetArg || !ontologyArg || !outArg || !adapterArg) {
  process.stderr.write(
    "usage: node run-ontology-stress-matrix.mjs <eval-set.json> <ontology.json> <outDir> <adapter.json> [repeats]\n"
  );
  process.exit(2);
}

const evalSet = JSON.parse(
  await fs.readFile(path.resolve(root, evalSetArg), "utf8")
);
const ontology = JSON.parse(
  await fs.readFile(path.resolve(root, ontologyArg), "utf8")
);

const repeats = repeatsArg == null
  ? Number(
      evalSet.analysisPlan?.minimumReplicatesPerTaskCondition ?? 5
    )
  : Number(repeatsArg);

if (!Number.isInteger(repeats) || repeats < 1) {
  throw new TypeError("repeats must be a positive integer");
}

const baselineOrder =
  evalSet.baselineOrder ?? ["B0", "B1", "B2", "B3", "P"];

if (!Array.isArray(baselineOrder) || baselineOrder.length !== 5) {
  throw new TypeError("v0.3 requires five frozen baselines");
}

const outRoot = path.resolve(root, outArg);
const relativeOut = path.relative(root, outRoot);
if (
  !relativeOut ||
  relativeOut.startsWith("..") ||
  path.isAbsolute(relativeOut)
) {
  throw new Error("output directory must stay inside repository");
}

await fs.rm(outRoot, { recursive: true, force: true });
await fs.mkdir(outRoot, { recursive: true });

const cellScript = path.join(
  root,
  "scripts/run-ontology-stress-cell.mjs"
);

const records = [];

function rotate(values, offset) {
  const k = ((offset % values.length) + values.length) %
    values.length;
  return [
    ...values.slice(k),
    ...values.slice(0, k)
  ];
}

for (
  let taskIndex = 0;
  taskIndex < evalSet.prospectiveTaskPacks.length;
  taskIndex += 1
) {
  const taskEntry = evalSet.prospectiveTaskPacks[taskIndex];
  const manifestPath = path.resolve(root, taskEntry.taskPack);
  const packRoot = path.dirname(manifestPath);
  const manifest = JSON.parse(
    await fs.readFile(manifestPath, "utf8")
  );

  const scenarios = [];
  for (const rel of manifest.scenarioFiles ?? []) {
    scenarios.push(
      JSON.parse(
        await fs.readFile(path.join(packRoot, rel), "utf8")
      )
    );
  }

  scenarios.sort((a, b) =>
    a.scenarioId.localeCompare(b.scenarioId)
  );

  for (
    let scenarioIndex = 0;
    scenarioIndex < scenarios.length;
    scenarioIndex += 1
  ) {
    const scenario = scenarios[scenarioIndex];

    for (
      let replicate = 1;
      replicate <= repeats;
      replicate += 1
    ) {
      const order = rotate(
        baselineOrder,
        replicate - 1 + taskIndex + scenarioIndex
      );

      for (const baselineId of order) {
        const cellOut = path.join(
          outRoot,
          `rep-${String(replicate).padStart(2, "0")}`,
          manifest.taskPackId,
          scenario.scenarioId,
          baselineId
        );

        const proc = spawnSync(
          process.execPath,
          [
            cellScript,
            taskEntry.taskPack,
            scenario.scenarioId,
            ontologyArg,
            evalSetArg,
            baselineId,
            path
              .relative(root, cellOut)
              .split(path.sep)
              .join("/"),
            adapterArg
          ],
          {
            cwd: root,
            encoding: "utf8"
          }
        );

        let cell = null;
        try {
          cell = JSON.parse(
            await fs.readFile(
              path.join(
                cellOut,
                "ontology-stress-cell-result.json"
              ),
              "utf8"
            )
          );
        } catch {}

        records.push({
          replicate,
          taskPackId: manifest.taskPackId,
          scenarioId: scenario.scenarioId,
          scenarioClass:
            cell?.scenarioClass ??
            (scenario.kind === "clean"
              ? "clean"
              : scenario.perturbation?.type ?? null),
          baselineId,
          processExitCode: proc.status,
          status: cell?.status ?? null,
          eligibleForScientificAnalysis:
            cell?.eligibleForScientificAnalysis ?? false,
          finalCorrect: cell?.final?.correct ?? false,
          evidenceSatisfied:
            cell?.final?.evidenceSatisfied ?? false,
          selectedRoleId:
            cell?.coordination?.selectedRoleId ?? null,
          roleContextCoverage:
            cell?.coordination?.roleDecision?.selectedScore
              ?.contextCoverage ?? null,
          selectedWorkerId:
            cell?.coordination?.selectedWorkerId ?? null,
          ontologyType:
            cell?.coordination?.ontologyType ?? null,
          contextKinds:
            cell?.coordination?.contextKinds ?? [],
          agentExecutionMs:
            cell?.execution?.agentExecutionMs ?? null,
          recoveryLatencyMs:
            cell?.execution?.recoveryLatencyMs ?? null,
          error:
            cell == null && proc.status !== 0
              ? (proc.stderr || proc.stdout || null)
              : null
        });
      }
    }
  }
}

function stats(values) {
  const numeric = values.filter(Number.isFinite);
  if (!numeric.length) {
    return {
      n: 0,
      mean: null,
      min: null,
      max: null
    };
  }

  return {
    n: numeric.length,
    mean:
      numeric.reduce((sum, value) => sum + value, 0) /
      numeric.length,
    min: Math.min(...numeric),
    max: Math.max(...numeric)
  };
}

const analyzable = records.filter(
  (record) => record.eligibleForScientificAnalysis
);

const byBaseline = baselineOrder.map((baselineId) => {
  const rows = analyzable.filter(
    (record) => record.baselineId === baselineId
  );
  const covered = rows.filter(
    (record) => record.scenarioClass === "contract_reveal"
  );
  const stress = rows.filter(
    (record) =>
      record.scenarioClass ===
      "ontology_stress_contract_mutation"
  );

  return {
    baselineId,
    runCount: rows.length,
    successCount: rows.filter(
      (record) =>
        record.finalCorrect &&
        record.evidenceSatisfied
    ).length,
    allAgentExecutionMs: stats(
      rows.map((record) => record.agentExecutionMs)
    ),
    coveredContractChange: {
      runCount: covered.length,
      successCount: covered.filter(
        (record) =>
          record.finalCorrect &&
          record.evidenceSatisfied
      ).length,
      recoveryLatencyMs: stats(
        covered.map(
          (record) => record.recoveryLatencyMs
        )
      ),
      selectedWorkers: covered.map(
        (record) => record.selectedWorkerId
      )
    },
    ontologyStress: {
      runCount: stress.length,
      successCount: stress.filter(
        (record) =>
          record.finalCorrect &&
          record.evidenceSatisfied
      ).length,
      recoveryLatencyMs: stats(
        stress.map(
          (record) => record.recoveryLatencyMs
        )
      ),
      selectedWorkers: stress.map(
        (record) => record.selectedWorkerId
      ),
      selectedRoles: stress.map(
        (record) => record.selectedRoleId
      ),
      roleContextCoverage: stress.map(
        (record) => record.roleContextCoverage
      )
    }
  };
});

const b3Stress = analyzable.filter(
  (record) =>
    record.baselineId === "B3" &&
    record.scenarioClass ===
      "ontology_stress_contract_mutation"
);
const pStress = analyzable.filter(
  (record) =>
    record.baselineId === "P" &&
    record.scenarioClass ===
      "ontology_stress_contract_mutation"
);

function pairKey(record) {
  return [
    record.taskPackId,
    record.scenarioId,
    record.replicate
  ].join("::");
}

const pByKey = new Map(
  pStress.map((record) => [pairKey(record), record])
);

const mechanismPairs = b3Stress
  .map((b3) => {
    const p = pByKey.get(pairKey(b3));
    if (!p) return null;
    return {
      taskPackId: b3.taskPackId,
      scenarioId: b3.scenarioId,
      replicate: b3.replicate,
      b3RoleId: b3.selectedRoleId,
      b3RoleContextCoverage: b3.roleContextCoverage,
      b3WorkerId: b3.selectedWorkerId,
      pWorkerId: p.selectedWorkerId,
      workerDiverged:
        b3.selectedWorkerId !== p.selectedWorkerId,
      b3RecoveryLatencyMs: b3.recoveryLatencyMs,
      pRecoveryLatencyMs: p.recoveryLatencyMs,
      b3MinusPRecoveryLatencyMs:
        Number.isFinite(b3.recoveryLatencyMs) &&
        Number.isFinite(p.recoveryLatencyMs)
          ? b3.recoveryLatencyMs -
            p.recoveryLatencyMs
          : null,
      b3Success:
        b3.finalCorrect && b3.evidenceSatisfied,
      pSuccess:
        p.finalCorrect && p.evidenceSatisfied
    };
  })
  .filter(Boolean);

const output = {
  schemaVersion: 1,
  evaluationSetId: evalSet.evaluationSetId,
  ontologySetId: ontology.ontologySetId,
  adapter: adapterArg,
  repeats,
  taskCount: evalSet.prospectiveTaskPacks.length,
  runCount: records.length,
  analyzableRunCount: analyzable.length,
  failedCellCount: records.filter(
    (record) => record.status == null
  ).length,
  baselineOrder,
  byBaseline,
  mechanismComparison: {
    stressPairCount: mechanismPairs.length,
    workerDivergenceCount: mechanismPairs.filter(
      (pair) => pair.workerDiverged
    ).length,
    zeroB3RoleContextCoverageCount:
      mechanismPairs.filter(
        (pair) =>
          pair.b3RoleContextCoverage === 0
      ).length,
    b3MinusPRecoveryLatencyMs: stats(
      mechanismPairs.map(
        (pair) =>
          pair.b3MinusPRecoveryLatencyMs
      )
    ),
    pairs: mechanismPairs
  },
  records
};

await fs.writeFile(
  path.join(
    outRoot,
    "ontology-stress-matrix-summary.json"
  ),
  JSON.stringify(output, null, 2) + "\n"
);

process.stdout.write(
  JSON.stringify(output, null, 2) + "\n"
);

const infrastructureFailures = records.filter(
  (record) =>
    record.status == null ||
    record.eligibleForScientificAnalysis !== true
).length;

process.exit(
  infrastructureFailures === 0 ? 0 : 1
);
