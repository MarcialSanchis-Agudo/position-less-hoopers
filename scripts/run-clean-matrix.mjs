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
    "usage: node run-clean-matrix.mjs <task-pack.json> <outDir> <adapter.json>\n"
  );
  process.exit(2);
}

const prepareScript = path.join(root, "scripts/prepare-task-pack.mjs");
const cellScript = path.join(root, "scripts/run-experiment-cell.mjs");

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

const cleanRuns = index.runs.filter((run) => run.scenarioKind === "clean");
const rows = [];

for (const run of cleanRuns) {
  const runRoot = path.join(outRoot, run.scenarioId, run.policy);
  const result = spawnSync(
    process.execPath,
    [
      cellScript,
      path.relative(root, runRoot),
      adapterArg
    ],
    { cwd: root, encoding: "utf8" }
  );

  let stdoutSummary = null;
  try {
    stdoutSummary = JSON.parse(result.stdout);
  } catch {}

  let cell = null;
  try {
    cell = JSON.parse(
      await fs.readFile(path.join(runRoot, "cell-result.json"), "utf8")
    );
  } catch {}

  rows.push({
    taskPackId: run.taskPackId,
    scenarioId: run.scenarioId,
    policy: run.policy,
    processExitCode: result.status,
    externalCorrect: cell?.externalCorrect ?? false,
    evidenceSatisfied: cell?.evidenceSatisfied ?? false,
    executionStatus: cell?.executionStatus ?? null,
    executionDurationMs: cell?.executionDurationMs ?? null,
    adapterId: cell?.adapterId ?? null,
    authoritativeEvidenceRefs: cell?.authoritativeEvidenceRefs ?? [],
    stdoutSummary
  });
}

const summary = {
  schemaVersion: 1,
  taskPackId: index.taskPackId,
  adapter: adapterArg,
  runCount: rows.length,
  successCount: rows.filter((row) =>
    row.externalCorrect && row.evidenceSatisfied
  ).length,
  rows
};

await fs.writeFile(
  path.join(outRoot, "matrix-summary.json"),
  JSON.stringify(summary, null, 2) + "\n"
);

process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
process.exit(summary.successCount === summary.runCount ? 0 : 1);

