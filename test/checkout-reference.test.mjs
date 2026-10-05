import assert from "node:assert/strict";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const preparer = path.join(root, "scripts/prepare-checkout-incident.mjs");
const injector = path.join(root, "scripts/inject-checkout-perturbation.mjs");
const applyReference = path.join(root, "scripts/apply-checkout-reference-solution.mjs");
const grader = path.join(root, "examples/checkout-incident/grader/grade.mjs");

function prepare(out) {
  return spawnSync(process.execPath, [preparer, out], {
    cwd: root,
    encoding: "utf8"
  });
}

function grade(runRoot, version) {
  return spawnSync(
    process.execPath,
    [grader, path.join(runRoot, "workspace"), String(version)],
    { cwd: root, encoding: "utf8" }
  );
}

test("checkout reference: solves clean v2", () => {
  const out = `results/test/checkout-reference-clean-${process.pid}`;
  const prep = prepare(out);
  assert.equal(prep.status, 0, prep.stderr);

  const runRoot = path.join(root, out, "checkout-clean-v2", "plh_direct");
  const applied = spawnSync(process.execPath, [
    applyReference,
    path.relative(root, runRoot)
  ], { cwd: root, encoding: "utf8" });
  assert.equal(applied.status, 0, applied.stderr);

  const result = grade(runRoot, 2);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(JSON.parse(result.stdout).correct, true);
});

test("checkout reference: survives hidden contract reveal", () => {
  const out = `results/test/checkout-reference-hidden-${process.pid}`;
  const prep = prepare(out);
  assert.equal(prep.status, 0, prep.stderr);

  const runRoot = path.join(root, out, "checkout-hidden-contract", "plh_pressure");

  const injection = spawnSync(process.execPath, [
    injector,
    path.relative(root, runRoot)
  ], { cwd: root, encoding: "utf8" });
  assert.equal(injection.status, 0, injection.stderr);

  const applied = spawnSync(process.execPath, [
    applyReference,
    path.relative(root, runRoot)
  ], { cwd: root, encoding: "utf8" });
  assert.equal(applied.status, 0, applied.stderr);

  const result = grade(runRoot, 2);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("checkout reference: survives external mutation to v3", () => {
  const out = `results/test/checkout-reference-v3-${process.pid}`;
  const prep = prepare(out);
  assert.equal(prep.status, 0, prep.stderr);

  const runRoot = path.join(root, out, "checkout-external-mutation", "plh_pressure");

  const injection = spawnSync(process.execPath, [
    injector,
    path.relative(root, runRoot)
  ], { cwd: root, encoding: "utf8" });
  assert.equal(injection.status, 0, injection.stderr);

  const contract = JSON.parse(
    fsSync.readFileSync(
      path.join(runRoot, "workspace/contract/payment-callback.json"),
      "utf8"
    )
  );
  assert.equal(contract.contractVersion, 3);

  const applied = spawnSync(process.execPath, [
    applyReference,
    path.relative(root, runRoot)
  ], { cwd: root, encoding: "utf8" });
  assert.equal(applied.status, 0, applied.stderr);

  const result = grade(runRoot, 3);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

