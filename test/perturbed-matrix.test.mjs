import assert from "node:assert/strict";
import fsSync from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const matrix = path.join(root, "scripts/run-perturbed-matrix.mjs");

function run(manifest, out) {
  return spawnSync(
    process.execPath,
    [
      matrix,
      manifest,
      out,
      "examples/adapters/reference-agent.json"
    ],
    { cwd: root, encoding: "utf8" }
  );
}

function read(out) {
  return JSON.parse(
    fsSync.readFileSync(
      path.join(root, out, "perturbed-matrix-summary.json"),
      "utf8"
    )
  );
}

test("PerturbedMatrix: checkout runs contract perturbations and excludes worker loss", () => {
  const out = `results/test/perturbed-matrix-checkout-${process.pid}`;
  const result = run(
    "examples/checkout-incident/task-pack.json",
    out
  );

  assert.equal(result.status, 0, result.stdout + result.stderr);
  const summary = read(out);

  assert.equal(summary.runCount, 12);
  assert.equal(summary.analyzableRunCount, 8);
  assert.equal(summary.excludedRunCount, 4);

  const workerRows = summary.rows.filter(
    (row) => row.perturbationType === "worker_loss"
  );
  assert.equal(workerRows.length, 4);
  assert.ok(workerRows.every(
    (row) => row.eligibleForScientificAnalysis === false
  ));

  const staticRows = summary.rows.filter(
    (row) =>
      row.policy === "static" &&
      row.eligibleForScientificAnalysis
  );
  assert.equal(staticRows.length, 2);
  assert.ok(staticRows.every((row) => row.finalCorrect === false));

  const plhRows = summary.rows.filter(
    (row) =>
      row.policy === "plh_direct" &&
      row.eligibleForScientificAnalysis
  );
  assert.equal(plhRows.length, 2);
  assert.ok(plhRows.every((row) => row.finalCorrect === true));
});

test("PerturbedMatrix: config migration uses same runner", () => {
  const out = `results/test/perturbed-matrix-config-${process.pid}`;
  const result = run(
    "examples/config-migration-incident/task-pack.json",
    out
  );

  assert.equal(result.status, 0, result.stdout + result.stderr);
  const summary = read(out);

  assert.equal(summary.runCount, 12);
  assert.equal(summary.analyzableRunCount, 8);

  const pressure = summary.byPolicy.find(
    (row) => row.policy === "plh_pressure"
  );
  assert.equal(pressure.runCount, 2);
  assert.equal(pressure.recoverySuccessCount, 2);
  assert.equal(pressure.recoverySuccessRate, 1);
  assert.ok(Number.isFinite(pressure.meanRecoveryLatencyMs));
});

