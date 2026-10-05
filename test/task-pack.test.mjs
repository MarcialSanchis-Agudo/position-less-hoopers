import assert from "node:assert/strict";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  normalizeTaskPackManifest,
  validateTaskPackManifest,
  validateTaskScenario
} from "../src/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const prepare = path.join(root, "scripts/prepare-task-pack.mjs");
const inject = path.join(root, "scripts/inject-task-pack.mjs");
const grade = path.join(root, "scripts/grade-task-pack.mjs");
const applyReference = path.join(root, "scripts/apply-task-pack-reference.mjs");

function run(command, args) {
  return spawnSync(process.execPath, [command, ...args], {
    cwd: root,
    encoding: "utf8"
  });
}

test("TaskPack: checkout and config manifests validate through one schema", () => {
  for (const rel of [
    "examples/checkout-incident/task-pack.json",
    "examples/config-migration-incident/task-pack.json"
  ]) {
    const manifest = JSON.parse(fsSync.readFileSync(path.join(root, rel), "utf8"));
    const validation = validateTaskPackManifest(manifest);
    assert.equal(validation.ok, true, validation.errors.join("; "));
    assert.equal(normalizeTaskPackManifest(manifest).schemaVersion, 1);
  }
});

test("TaskPack: both domains prepare identical policy matrices with generic preparer", () => {
  const packs = [
    ["examples/checkout-incident/task-pack.json", "checkout-incident"],
    ["examples/config-migration-incident/task-pack.json", "config-migration-incident"]
  ];

  for (const [manifest, id] of packs) {
    const out = `results/test/task-pack-${id}-${process.pid}`;
    const result = run(prepare, [manifest, out]);
    assert.equal(result.status, 0, result.stderr);

    const index = JSON.parse(
      fsSync.readFileSync(path.join(root, out, "index.json"), "utf8")
    );

    assert.equal(index.taskPackId, id);
    assert.equal(index.runs.length, 16);
    assert.deepEqual(index.policies, [
      "static",
      "greedy",
      "plh_direct",
      "plh_pressure"
    ]);
  }
});

test("TaskPack: config seed passes v1 but fails v2 and v3 external graders", () => {
  const out = `results/test/config-grade-${process.pid}`;
  const prepared = run(prepare, [
    "examples/config-migration-incident/task-pack.json",
    out,
    "static"
  ]);
  assert.equal(prepared.status, 0, prepared.stderr);

  const runRoot = path.join(root, out, "config-clean-v2", "static");
  const workspace = path.join(runRoot, "workspace");
  const graderPath = path.join(
    root,
    "examples/config-migration-incident/grader/grade.mjs"
  );

  for (const [version, shouldPass] of [[1, true], [2, false], [3, false]]) {
    const result = spawnSync(
      process.execPath,
      [graderPath, workspace, String(version)],
      { cwd: root, encoding: "utf8" }
    );
    assert.equal(result.status === 0, shouldPass);
  }
});

test("TaskPack: config reference solution solves v3", () => {
  const out = `results/test/config-reference-${process.pid}`;
  const prepared = run(prepare, [
    "examples/config-migration-incident/task-pack.json",
    out,
    "plh_pressure"
  ]);
  assert.equal(prepared.status, 0, prepared.stderr);

  const runRoot = path.join(
    root,
    out,
    "config-external-mutation",
    "plh_pressure"
  );

  const injected = run(inject, [path.relative(root, runRoot)]);
  assert.equal(injected.status, 0, injected.stderr);

  const contract = JSON.parse(
    fsSync.readFileSync(
      path.join(runRoot, "workspace/contract/migration.json"),
      "utf8"
    )
  );
  assert.equal(contract.contractVersion, 3);

  const applied = run(applyReference, [
    path.relative(root, runRoot),
    "examples/config-migration-incident/reference-solution/migrate.mjs",
    "src/migrate.mjs"
  ]);
  assert.equal(applied.status, 0, applied.stderr);

  const graded = run(grade, [path.relative(root, runRoot)]);
  assert.equal(graded.status, 0, graded.stdout + graded.stderr);
  assert.equal(JSON.parse(graded.stdout).correct, true);
});

test("TaskPack: generic injector changes only active contract for contract perturbation", () => {
  const out = `results/test/task-pack-inject-${process.pid}`;
  const prepared = run(prepare, [
    "examples/config-migration-incident/task-pack.json",
    out,
    "static"
  ]);
  assert.equal(prepared.status, 0, prepared.stderr);

  const runRoot = path.join(root, out, "config-hidden-contract", "static");
  const sourceBefore = fsSync.readFileSync(
    path.join(runRoot, "workspace/src/migrate.mjs"),
    "utf8"
  );
  const contractBefore = JSON.parse(
    fsSync.readFileSync(
      path.join(runRoot, "workspace/contract/migration.json"),
      "utf8"
    )
  );
  assert.equal(contractBefore.contractVersion, 1);

  const injected = run(inject, [path.relative(root, runRoot)]);
  assert.equal(injected.status, 0, injected.stderr);

  const sourceAfter = fsSync.readFileSync(
    path.join(runRoot, "workspace/src/migrate.mjs"),
    "utf8"
  );
  const contractAfter = JSON.parse(
    fsSync.readFileSync(
      path.join(runRoot, "workspace/contract/migration.json"),
      "utf8"
    )
  );

  assert.equal(sourceAfter, sourceBefore);
  assert.equal(contractAfter.contractVersion, 2);
});

