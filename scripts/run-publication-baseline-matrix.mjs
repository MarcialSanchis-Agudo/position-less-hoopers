import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  classifyPublicationScenario,
  normalizeTaskPackManifest
} from "../src/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const evalSetArg = process.argv[2];
const baselineConfigArg = process.argv[3];
const outArg = process.argv[4];
const adapterArg = process.argv[5];
const repeatsArg = process.argv[6] ?? null;

if (!evalSetArg || !baselineConfigArg || !outArg || !adapterArg) {
  process.stderr.write(
    "usage: node run-publication-baseline-matrix.mjs <evaluation-set.json> <baseline-config.json> <outDir> <adapter.json> [repeats]\n"
  );
  process.exit(2);
}

const evalSet = JSON.parse(
  await fs.readFile(path.resolve(root, evalSetArg), "utf8")
);
const baselineConfig = JSON.parse(
  await fs.readFile(path.resolve(root, baselineConfigArg), "utf8")
);
const repeats = repeatsArg == null
  ? Number(evalSet.analysisPlan?.minimumReplicatesPerTaskCondition ?? 5)
  : Number(repeatsArg);

if (!Number.isInteger(repeats) || repeats < 1) {
  throw new TypeError("repeats must be a positive integer");
}

const baselineOrder = baselineConfig.baselineOrder ?? ["B0", "B1", "B2", "B3", "P"];
if (!Array.isArray(baselineOrder) || baselineOrder.length !== 5) {
  throw new TypeError("publication baseline config must define five baselines");
}

const requiredScenarioClasses = new Set(evalSet.requiredScenarioClasses ?? []);
const outRoot = path.resolve(root, outArg);
const relativeOut = path.relative(root, outRoot);
if (!relativeOut || relativeOut.startsWith("..") || path.isAbsolute(relativeOut)) {
  throw new Error("output directory must stay inside repository");
}

await fs.rm(outRoot, { recursive: true, force: true });
await fs.mkdir(outRoot, { recursive: true });

const cellScript = path.join(root, "scripts/run-publication-baseline-cell.mjs");
const taskEntries = evalSet.prospectiveEvaluationTaskPacks ?? [];
const records = [];

function rotate(values, offset) {
  const n = values.length;
  const k = ((offset % n) + n) % n;
  return [...values.slice(k), ...values.slice(0, k)];
}

for (let taskIndex = 0; taskIndex < taskEntries.length; taskIndex += 1) {
  const taskEntry = taskEntries[taskIndex];
  const manifestArg = taskEntry.taskPack;
  const manifestPath = path.resolve(root, manifestArg);
  const packRoot = path.dirname(manifestPath);
  const manifest = normalizeTaskPackManifest(
    JSON.parse(await fs.readFile(manifestPath, "utf8"))
  );

  const scenarios = [];
  for (const rel of manifest.scenarioFiles) {
    const scenario = JSON.parse(
      await fs.readFile(path.join(packRoot, rel), "utf8")
    );
    const classification = classifyPublicationScenario(scenario);
    if (requiredScenarioClasses.has(classification.scenarioClass)) {
      scenarios.push({ scenario, classification });
    }
  }

  scenarios.sort((a, b) =>
    a.scenario.scenarioId.localeCompare(b.scenario.scenarioId)
  );

  for (let scenarioIndex = 0; scenarioIndex < scenarios.length; scenarioIndex += 1) {
    const { scenario, classification } = scenarios[scenarioIndex];

    for (let replicate = 1; replicate <= repeats; replicate += 1) {
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
            manifestArg,
            scenario.scenarioId,
            baselineConfigArg,
            baselineId,
            path.relative(root, cellOut).split(path.sep).join("/"),
            adapterArg
          ],
          { cwd: root, encoding: "utf8" }
        );

        let cell = null;
        try {
          cell = JSON.parse(
            await fs.readFile(
              path.join(cellOut, "publication-cell-result.json"),
              "utf8"
            )
          );
        } catch {}

        records.push({
          replicate,
          taskPackId: manifest.taskPackId,
          scenarioId: scenario.scenarioId,
          scenarioClass: classification.scenarioClass,
          baselineId,
          processExitCode: proc.status,
          status: cell?.status ?? null,
          eligibleForScientificAnalysis:
            cell?.eligibleForScientificAnalysis ?? false,
          finalCorrect: cell?.final?.correct ?? false,
          evidenceSatisfied: cell?.final?.evidenceSatisfied ?? false,
          selectedWorkerId:
            cell?.coordination?.selectedWorkerId ?? null,
          ontologyType:
            cell?.coordination?.ontologyType ?? null,
          predefinedRoleId:
            cell?.coordination?.predefinedRoleId ?? null,
          agentExecutionMs:
            cell?.execution?.agentExecutionMs ?? null,
          recoveryLatencyMs:
            cell?.execution?.recoveryLatencyMs ?? null,
          contextKinds:
            cell?.coordination?.contextKinds ?? [],
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
    return { n: 0, mean: null, min: null, max: null };
  }
  return {
    n: numeric.length,
    mean: numeric.reduce((sum, value) => sum + value, 0) / numeric.length,
    min: Math.min(...numeric),
    max: Math.max(...numeric)
  };
}

const analyzable = records.filter(
  (record) => record.eligibleForScientificAnalysis
);

const byBaseline = baselineOrder.map((baselineId) => {
  const rows = analyzable.filter((row) => row.baselineId === baselineId);
  const clean = rows.filter((row) => row.scenarioClass === "clean");
  const perturbed = rows.filter((row) => row.scenarioClass !== "clean");

  return {
    baselineId,
    runCount: rows.length,
    successCount: rows.filter(
      (row) => row.finalCorrect && row.evidenceSatisfied
    ).length,
    clean: {
      runCount: clean.length,
      successCount: clean.filter(
        (row) => row.finalCorrect && row.evidenceSatisfied
      ).length,
      agentExecutionMs: stats(clean.map((row) => row.agentExecutionMs))
    },
    perturbed: {
      runCount: perturbed.length,
      successCount: perturbed.filter(
        (row) => row.finalCorrect && row.evidenceSatisfied
      ).length,
      agentExecutionMs: stats(
        perturbed.map((row) => row.agentExecutionMs)
      ),
      recoveryLatencyMs: stats(
        perturbed.map((row) => row.recoveryLatencyMs)
      )
    },
    selectedWorkerIds: rows.map((row) => row.selectedWorkerId)
  };
});

const byTaskScenario = [];
for (const taskEntry of taskEntries) {
  const manifest = normalizeTaskPackManifest(
    JSON.parse(
      await fs.readFile(path.resolve(root, taskEntry.taskPack), "utf8")
    )
  );
  const taskRows = analyzable.filter(
    (row) => row.taskPackId === manifest.taskPackId
  );
  const scenarioIds = [...new Set(taskRows.map((row) => row.scenarioId))]
    .sort((a, b) => a.localeCompare(b));

  for (const scenarioId of scenarioIds) {
    const rows = taskRows.filter((row) => row.scenarioId === scenarioId);
    byTaskScenario.push({
      taskPackId: manifest.taskPackId,
      scenarioId,
      scenarioClass: rows[0]?.scenarioClass ?? null,
      baselines: baselineOrder.map((baselineId) => {
        const baselineRows = rows.filter(
          (row) => row.baselineId === baselineId
        );
        return {
          baselineId,
          runCount: baselineRows.length,
          successCount: baselineRows.filter(
            (row) => row.finalCorrect && row.evidenceSatisfied
          ).length,
          agentExecutionMs: stats(
            baselineRows.map((row) => row.agentExecutionMs)
          ),
          recoveryLatencyMs: stats(
            baselineRows.map((row) => row.recoveryLatencyMs)
          )
        };
      })
    });
  }
}

const output = {
  schemaVersion: 1,
  evaluationSetId: evalSet.evaluationSetId,
  baselineSetId: baselineConfig.baselineSetId,
  adapter: adapterArg,
  repeats,
  taskCount: taskEntries.length,
  runCount: records.length,
  analyzableRunCount: analyzable.length,
  failedCellCount: records.filter(
    (record) => record.status == null || record.processExitCode == null
  ).length,
  baselineOrder,
  requiredScenarioClasses: [...requiredScenarioClasses],
  byBaseline,
  byTaskScenario,
  records
};

await fs.writeFile(
  path.join(outRoot, "publication-baseline-matrix-summary.json"),
  JSON.stringify(output, null, 2) + "\n"
);

process.stdout.write(JSON.stringify(output, null, 2) + "\n");

const infrastructureFailures = records.filter(
  (record) =>
    record.status == null ||
    record.eligibleForScientificAnalysis !== true
).length;

process.exit(infrastructureFailures === 0 ? 0 : 1);
