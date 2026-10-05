import assert from "node:assert/strict";
import fsSync from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const matrix = path.join(root, "scripts/run-clean-matrix.mjs");

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

test("CleanMatrix: executes all policies for checkout clean scenario", () => {
  const out = `results/test/clean-matrix-checkout-${process.pid}`;
  const result = run(
    "examples/checkout-incident/task-pack.json",
    out
  );

  assert.equal(result.status, 0, result.stdout + result.stderr);

  const summary = JSON.parse(
    fsSync.readFileSync(
      path.join(root, out, "matrix-summary.json"),
      "utf8"
    )
  );

  assert.equal(summary.runCount, 4);
  assert.equal(summary.successCount, 4);
  assert.deepEqual(
    summary.rows.map((row) => row.policy),
    ["static", "greedy", "plh_direct", "plh_pressure"]
  );
  assert.ok(summary.rows.every((row) => row.externalCorrect));
});

test("CleanMatrix: same orchestrator executes config migration clean matrix", () => {
  const out = `results/test/clean-matrix-config-${process.pid}`;
  const result = run(
    "examples/config-migration-incident/task-pack.json",
    out
  );

  assert.equal(result.status, 0, result.stdout + result.stderr);

  const summary = JSON.parse(
    fsSync.readFileSync(
      path.join(root, out, "matrix-summary.json"),
      "utf8"
    )
  );

  assert.equal(summary.runCount, 4);
  assert.equal(summary.successCount, 4);
  assert.ok(summary.rows.every((row) => row.evidenceSatisfied));
});

