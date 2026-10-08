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
const maxCellsArg = process.argv[7] ?? null;

if (!evalSetArg || !ontologyArg || !outArg || !adapterArg) {
  process.stderr.write(
    "usage: node run-ontology-stress-matrix-v0.3.1.mjs <eval-set.json> <ontology.json> <outDir> <adapter.json> [repeats] [maxCells]\n"
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

const maxCells = maxCellsArg == null
  ? Number.POSITIVE_INFINITY
  : Number(maxCellsArg);

if (!Number.isInteger(repeats) || repeats < 1) {
  throw new TypeError("repeats must be a positive integer");
}
if (
  maxCells !== Number.POSITIVE_INFINITY &&
  (!Number.isInteger(maxCells) || maxCells < 1)
) {
  throw new TypeError("maxCells must be a positive integer");
}

const baselineOrder =
  evalSet.baselineOrder ?? ["B0", "B1", "B2", "B3", "P"];

if (!Array.isArray(baselineOrder) || baselineOrder.length !== 5) {
  throw new TypeError("v0.3.1 requires five frozen baselines");
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

await fs.mkdir(outRoot, { recursive: true });

const checkpointPath = path.join(
  outRoot,
  "ontology-stress-checkpoint.json"
);
const progressPath = path.join(
  outRoot,
  "ontology-stress-progress.json"
);
const finalSummaryPath = path.join(
  outRoot,
  "ontology-stress-matrix-summary.json"
);
const cellScript = path.join(
  root,
  "scripts/run-ontology-stress-cell-v0.3.1.mjs"
);

function rotate(values, offset) {
  const k = ((offset % values.length) + values.length) %
    values.length;
  return [
    ...values.slice(k),
    ...values.slice(0, k)
  ];
}

const schedule = [];

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
        schedule.push({
          scheduleIndex: schedule.length,
          replicate,
          taskPackPath: taskEntry.taskPack,
          taskPackId: manifest.taskPackId,
          scenarioId: scenario.scenarioId,
          scenarioClass:
            scenario.kind === "clean"
              ? "clean"
              : scenario.perturbation?.type ?? null,
          baselineId
        });
      }
    }
  }
}

async function loadCheckpoint() {
  try {
    return JSON.parse(
      await fs.readFile(checkpointPath, "utf8")
    );
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return null;
  }
}

function validateCheckpoint(checkpoint) {
  const checks = [
    [
      checkpoint.evaluationSetId,
      evalSet.evaluationSetId,
      "evaluationSetId"
    ],
    [
      checkpoint.ontologySetId,
      ontology.ontologySetId,
      "ontologySetId"
    ],
    [
      checkpoint.adapter,
      adapterArg,
      "adapter"
    ],
    [
      checkpoint.repeats,
      repeats,
      "repeats"
    ],
    [
      checkpoint.totalCells,
      schedule.length,
      "totalCells"
    ]
  ];

  for (const [actual, expected, label] of checks) {
    if (actual !== expected) {
      throw new Error(
        `checkpoint ${label} mismatch: ${actual} !== ${expected}`
      );
    }
  }
}

let checkpoint = await loadCheckpoint();

if (checkpoint == null) {
  checkpoint = {
    schemaVersion: 1,
    runnerVersion: "v0.3.1",
    evaluationSetId: evalSet.evaluationSetId,
    ontologySetId: ontology.ontologySetId,
    adapter: adapterArg,
    repeats,
    totalCells: schedule.length,
    nextCellIndex: 0,
    records: [],
    infrastructureFailures: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await fs.writeFile(
    checkpointPath,
    JSON.stringify(checkpoint, null, 2) + "\n"
  );
} else {
  validateCheckpoint(checkpoint);
}

function compactRecord(spec, cell, proc) {
  return {
    scheduleIndex: spec.scheduleIndex,
    replicate: spec.replicate,
    taskPackId: spec.taskPackId,
    scenarioId: spec.scenarioId,
    scenarioClass:
      cell?.scenarioClass ?? spec.scenarioClass,
    baselineId: spec.baselineId,
    processExitCode: proc.status,
    status: cell?.status ?? null,
    failureClass: cell?.failureClass ?? null,
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
      cell?.execution?.agentExecutionMs ??
      cell?.execution?.durationMs ??
      null,
    recoveryLatencyMs:
      cell?.execution?.recoveryLatencyMs ?? null,
    executorDiagnostics:
      cell?.status === "infrastructure_failed"
        ? cell.execution
        : null
  };
}

async function persistCheckpoint() {
  checkpoint.updatedAt = new Date().toISOString();
  await fs.writeFile(
    checkpointPath,
    JSON.stringify(checkpoint, null, 2) + "\n"
  );
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

function buildSummary(records) {
  const analyzable = records.filter(
    (record) => record.eligibleForScientificAnalysis
  );

  const byBaseline = baselineOrder.map((baselineId) => {
    const rows = analyzable.filter(
      (record) => record.baselineId === baselineId
    );
    const covered = rows.filter(
      (record) =>
        record.scenarioClass === "contract_reveal"
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

  const pairs = b3Stress
    .map((b3) => {
      const p = pByKey.get(pairKey(b3));
      if (!p) return null;
      return {
        taskPackId: b3.taskPackId,
        scenarioId: b3.scenarioId,
        replicate: b3.replicate,
        b3RoleId: b3.selectedRoleId,
        b3RoleContextCoverage:
          b3.roleContextCoverage,
        b3WorkerId: b3.selectedWorkerId,
        pWorkerId: p.selectedWorkerId,
        workerDiverged:
          b3.selectedWorkerId !==
          p.selectedWorkerId,
        b3RecoveryLatencyMs:
          b3.recoveryLatencyMs,
        pRecoveryLatencyMs:
          p.recoveryLatencyMs,
        b3MinusPRecoveryLatencyMs:
          Number.isFinite(b3.recoveryLatencyMs) &&
          Number.isFinite(p.recoveryLatencyMs)
            ? b3.recoveryLatencyMs -
              p.recoveryLatencyMs
            : null,
        b3Success:
          b3.finalCorrect &&
          b3.evidenceSatisfied,
        pSuccess:
          p.finalCorrect &&
          p.evidenceSatisfied
      };
    })
    .filter(Boolean);

  return {
    schemaVersion: 1,
    runnerVersion: "v0.3.1",
    evaluationSetId: evalSet.evaluationSetId,
    ontologySetId: ontology.ontologySetId,
    adapter: adapterArg,
    repeats,
    taskCount: evalSet.prospectiveTaskPacks.length,
    scheduledRunCount: schedule.length,
    completedScientificRunCount: analyzable.length,
    infrastructureFailureCount:
      checkpoint.infrastructureFailures.length,
    complete:
      checkpoint.nextCellIndex === schedule.length,
    baselineOrder,
    byBaseline,
    mechanismComparison: {
      stressPairCount: pairs.length,
      workerDivergenceCount: pairs.filter(
        (pair) => pair.workerDiverged
      ).length,
      zeroB3RoleContextCoverageCount:
        pairs.filter(
          (pair) =>
            pair.b3RoleContextCoverage === 0
        ).length,
      b3MinusPRecoveryLatencyMs: stats(
        pairs.map(
          (pair) =>
            pair.b3MinusPRecoveryLatencyMs
        )
      ),
      pairs
    },
    records: analyzable
  };
}

let cellsThisInvocation = 0;

while (
  checkpoint.nextCellIndex < schedule.length &&
  cellsThisInvocation < maxCells
) {
  const spec = schedule[checkpoint.nextCellIndex];

  const cellOut = path.join(
    outRoot,
    "cells",
    String(spec.scheduleIndex).padStart(3, "0"),
    spec.taskPackId,
    spec.scenarioId,
    spec.baselineId
  );

  const proc = spawnSync(
    process.execPath,
    [
      cellScript,
      spec.taskPackPath,
      spec.scenarioId,
      ontologyArg,
      evalSetArg,
      spec.baselineId,
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

  const record = compactRecord(spec, cell, proc);

  if (
    record.status === "infrastructure_failed" ||
    record.eligibleForScientificAnalysis !== true
  ) {
    checkpoint.infrastructureFailures.push({
      occurredAt: new Date().toISOString(),
      scheduleIndex: spec.scheduleIndex,
      taskPackId: spec.taskPackId,
      scenarioId: spec.scenarioId,
      baselineId: spec.baselineId,
      processExitCode: proc.status,
      diagnostics:
        record.executorDiagnostics,
      stderrTail:
        String(proc.stderr ?? "").slice(-1200),
      stdoutTail:
        String(proc.stdout ?? "").slice(-1200)
    });
    await persistCheckpoint();

    const progress = {
      schemaVersion: 1,
      status: "paused_on_infrastructure_failure",
      nextCellIndex: checkpoint.nextCellIndex,
      totalCells: schedule.length,
      completedScientificRunCount:
        checkpoint.records.length,
      lastInfrastructureFailure:
        checkpoint.infrastructureFailures.at(-1)
    };

    await fs.writeFile(
      progressPath,
      JSON.stringify(progress, null, 2) + "\n"
    );
    process.stdout.write(
      JSON.stringify(progress, null, 2) + "\n"
    );
    process.exit(3);
  }

  checkpoint.records.push(record);
  checkpoint.nextCellIndex += 1;
  cellsThisInvocation += 1;
  await persistCheckpoint();
}

const summary = buildSummary(checkpoint.records);

if (checkpoint.nextCellIndex === schedule.length) {
  await fs.writeFile(
    finalSummaryPath,
    JSON.stringify(summary, null, 2) + "\n"
  );
}

const progress = {
  schemaVersion: 1,
  status:
    checkpoint.nextCellIndex === schedule.length
      ? "complete"
      : "batch_complete",
  nextCellIndex: checkpoint.nextCellIndex,
  totalCells: schedule.length,
  completedScientificRunCount:
    checkpoint.records.length,
  infrastructureFailureCount:
    checkpoint.infrastructureFailures.length,
  summary:
    checkpoint.nextCellIndex === schedule.length
      ? summary
      : null
};

await fs.writeFile(
  progressPath,
  JSON.stringify(progress, null, 2) + "\n"
);

process.stdout.write(
  JSON.stringify(progress, null, 2) + "\n"
);
process.exit(0);
