import assert from "node:assert/strict";
import fsSync from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const prepare = path.join(root, "scripts/prepare-task-pack.mjs");
const perturbed = path.join(root, "scripts/run-perturbed-cell.mjs");

function run(command, args) {
  return spawnSync(process.execPath, [command, ...args], {
    cwd: root,
    encoding: "utf8"
  });
}

function preparePolicy(manifest, out, policy) {
  const result = run(prepare, [manifest, out, policy]);
  assert.equal(result.status, 0, result.stderr);
}

function readResult(runRoot) {
  return JSON.parse(
    fsSync.readFileSync(path.join(runRoot, "perturbed-result.json"), "utf8")
  );
}

test("PerturbedCell: static policy does not recover after hidden contract reveal", () => {
  const out = `results/test/perturbed-static-${process.pid}`;
  preparePolicy("examples/checkout-incident/task-pack.json", out, "static");
  const runRoot = path.join(root, out, "checkout-hidden-contract", "static");

  const result = run(perturbed, [
    path.relative(root, runRoot),
    "examples/adapters/reference-agent.json"
  ]);

  assert.notEqual(result.status, 0);
  const record = readResult(runRoot);
  assert.equal(record.phase1.gradeCorrect, true);
  assert.equal(record.perturbation.postPerturbationGradeCorrect, false);
  assert.equal(record.recovery.executed, false);
  assert.equal(record.finalCell.externalCorrect, false);
});

test("PerturbedCell: PLH direct recovers after hidden contract reveal", () => {
  const out = `results/test/perturbed-direct-${process.pid}`;
  preparePolicy("examples/checkout-incident/task-pack.json", out, "plh_direct");
  const runRoot = path.join(root, out, "checkout-hidden-contract", "plh_direct");

  const result = run(perturbed, [
    path.relative(root, runRoot),
    "examples/adapters/reference-agent.json"
  ]);

  assert.equal(result.status, 0, result.stdout + result.stderr);
  const record = readResult(runRoot);
  assert.equal(record.phase1.gradeCorrect, true);
  assert.equal(record.perturbation.postPerturbationGradeCorrect, false);
  assert.equal(record.recovery.executed, true);
  assert.equal(record.finalCell.externalCorrect, true);
  assert.equal(record.finalCell.evidenceSatisfied, true);
});

test("PerturbedCell: PLH pressure adapts to config v2 -> v3 mutation", () => {
  const out = `results/test/perturbed-config-${process.pid}`;
  preparePolicy(
    "examples/config-migration-incident/task-pack.json",
    out,
    "plh_pressure"
  );
  const runRoot = path.join(
    root,
    out,
    "config-external-mutation",
    "plh_pressure"
  );

  const result = run(perturbed, [
    path.relative(root, runRoot),
    "examples/adapters/reference-agent.json"
  ]);

  assert.equal(result.status, 0, result.stdout + result.stderr);
  const record = readResult(runRoot);
  assert.equal(record.phase1.gradeCorrect, true);
  assert.equal(record.perturbation.postPerturbationGradeCorrect, false);
  assert.equal(record.recovery.executed, true);
  assert.equal(record.finalCell.externalCorrect, true);
});

test("PerturbedCell: worker loss is excluded until live interruption exists", () => {
  const out = `results/test/perturbed-worker-${process.pid}`;
  preparePolicy("examples/checkout-incident/task-pack.json", out, "plh_direct");
  const runRoot = path.join(root, out, "checkout-worker-loss", "plh_direct");

  const result = run(perturbed, [
    path.relative(root, runRoot),
    "examples/adapters/reference-agent.json"
  ]);

  assert.equal(result.status, 3);
  const record = readResult(runRoot);
  assert.equal(record.status, "unsupported_live_interrupt");
  assert.equal(record.eligibleForScientificAnalysis, false);
});

