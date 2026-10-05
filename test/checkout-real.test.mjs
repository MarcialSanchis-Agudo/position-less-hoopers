import assert from "node:assert/strict";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const grader = path.join(root, "examples/checkout-incident/grader/grade.mjs");
const preparer = path.join(root, "scripts/prepare-checkout-incident.mjs");
const injector = path.join(root, "scripts/inject-checkout-perturbation.mjs");
const seed = path.join(root, "examples/checkout-incident/seed");

function runGrader(workspace, version) {
  return spawnSync(process.execPath, [grader, workspace, String(version)], {
    cwd: root,
    encoding: "utf8"
  });
}

test("checkout real: seed satisfies v1 but not hidden v2/v3 contracts", () => {
  const v1 = runGrader(seed, 1);
  const v2 = runGrader(seed, 2);
  const v3 = runGrader(seed, 3);

  assert.equal(v1.status, 0, v1.stdout + v1.stderr);
  assert.equal(JSON.parse(v1.stdout).correct, true);

  assert.notEqual(v2.status, 0);
  assert.equal(JSON.parse(v2.stdout).correct, false);

  assert.notEqual(v3.status, 0);
  assert.equal(JSON.parse(v3.stdout).correct, false);
});

test("checkout real: preparer creates all scenario/policy workspaces", () => {
  const out = `results/test/checkout-incident-${process.pid}`;
  const abs = path.join(root, out);
  fs.rm(abs, { recursive: true, force: true }).catch(() => {});

  const result = spawnSync(process.execPath, [preparer, out], {
    cwd: root,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);

  const index = JSON.parse(
    requireFs(path.join(abs, "index.json"))
  );

  assert.equal(index.runs.length, 16);

  const byScenario = new Map();
  for (const run of index.runs) {
    const rows = byScenario.get(run.scenarioId) ?? [];
    rows.push(run);
    byScenario.set(run.scenarioId, rows);
  }

  for (const rows of byScenario.values()) {
    assert.equal(rows.length, 4);
    assert.equal(new Set(rows.map((row) => row.seedHash)).size, 1);
  }
});

function requireFs(file) {
  return fsSync.readFileSync(file, "utf8");
}

test("checkout real: hidden-contract perturbation reveals v2 contract only", () => {
  const out = `results/test/checkout-hidden-${process.pid}`;
  const abs = path.join(root, out);
  const prep = spawnSync(process.execPath, [preparer, out], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(prep.status, 0, prep.stderr);

  const runRoot = path.join(abs, "checkout-hidden-contract", "plh_pressure");
  const before = JSON.parse(
    requireFs(path.join(runRoot, "workspace/contract/payment-callback.json"))
  );
  assert.equal(before.contractVersion, 1);

  const relativeRunRoot = path.relative(root, runRoot);
  const injected = spawnSync(process.execPath, [injector, relativeRunRoot], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(injected.status, 0, injected.stderr);

  const after = JSON.parse(
    requireFs(path.join(runRoot, "workspace/contract/payment-callback.json"))
  );
  assert.equal(after.contractVersion, 2);
});

test("checkout real: clean v2 workspace is externally graded against v2", () => {
  const out = `results/test/checkout-grade-${process.pid}`;
  const abs = path.join(root, out);
  const prep = spawnSync(process.execPath, [preparer, out], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(prep.status, 0, prep.stderr);

  const runRoot = path.join(abs, "checkout-clean-v2", "static");
  const result = runGrader(path.join(runRoot, "workspace"), 2);

  assert.notEqual(result.status, 0);
  const grade = JSON.parse(result.stdout);
  assert.equal(grade.correct, false);
  assert.ok(grade.failed > 0);
});

