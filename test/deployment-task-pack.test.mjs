import assert from "node:assert/strict";
import fsSync from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  normalizeTaskPackManifest,
  validateTaskPackManifest
} from "../src/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const prepare = path.join(root, "scripts/prepare-task-pack.mjs");
const applyReference = path.join(root, "scripts/apply-task-pack-reference.mjs");
const matrix = path.join(root, "scripts/run-event-stream-matrix.mjs");

function run(command, args) {
  return spawnSync(process.execPath, [command, ...args], {
    cwd: root,
    encoding: "utf8"
  });
}

test("Deployment TaskPack: manifest validates", () => {
  const manifest = JSON.parse(
    fsSync.readFileSync(
      path.join(root, "examples/deployment-rollout-incident/task-pack.json"),
      "utf8"
    )
  );
  const validation = validateTaskPackManifest(manifest);
  assert.equal(validation.ok, true, validation.errors.join("; "));
  assert.equal(
    normalizeTaskPackManifest(manifest).taskPackId,
    "deployment-rollout-incident"
  );
});

test("Deployment TaskPack: seed passes v1 and fails v2/v3", () => {
  const out = `results/test/deployment-grade-${process.pid}`;
  const prepared = run(prepare, [
    "examples/deployment-rollout-incident/task-pack.json",
    out,
    "static"
  ]);
  assert.equal(prepared.status, 0, prepared.stderr);

  const workspace = path.join(
    root,
    out,
    "deployment-clean-v2",
    "static",
    "workspace"
  );
  const grader = path.join(
    root,
    "examples/deployment-rollout-incident/grader/grade.mjs"
  );

  for (const [version, shouldPass] of [
    [1, true],
    [2, false],
    [3, false]
  ]) {
    const result = spawnSync(
      process.execPath,
      [grader, workspace, String(version)],
      { cwd: root, encoding: "utf8" }
    );
    assert.equal(
      result.status === 0,
      shouldPass,
      result.stdout + result.stderr
    );
  }
});

test("Deployment TaskPack: v2 oracle passes v2 but not v3; v3 oracle passes v3", () => {
  const out = `results/test/deployment-reference-${process.pid}`;
  const prepared = run(prepare, [
    "examples/deployment-rollout-incident/task-pack.json",
    out,
    "plh_pressure"
  ]);
  assert.equal(prepared.status, 0, prepared.stderr);

  const runRoot = path.join(
    root,
    out,
    "deployment-clean-v2",
    "plh_pressure"
  );
  const workspace = path.join(runRoot, "workspace");
  const grader = path.join(
    root,
    "examples/deployment-rollout-incident/grader/grade.mjs"
  );

  const appliedV2 = run(applyReference, [
    path.relative(root, runRoot),
    "examples/deployment-rollout-incident/reference-solution/v2.mjs",
    "src/rollout.mjs"
  ]);
  assert.equal(appliedV2.status, 0, appliedV2.stderr);

  const gradeV2 = spawnSync(
    process.execPath,
    [grader, workspace, "2"],
    { cwd: root, encoding: "utf8" }
  );
  assert.equal(gradeV2.status, 0, gradeV2.stdout + gradeV2.stderr);

  const gradeV3Before = spawnSync(
    process.execPath,
    [grader, workspace, "3"],
    { cwd: root, encoding: "utf8" }
  );
  assert.notEqual(gradeV3Before.status, 0);

  const appliedV3 = run(applyReference, [
    path.relative(root, runRoot),
    "examples/deployment-rollout-incident/reference-solution/v3.mjs",
    "src/rollout.mjs"
  ]);
  assert.equal(appliedV3.status, 0, appliedV3.stderr);

  const gradeV3 = spawnSync(
    process.execPath,
    [grader, workspace, "3"],
    { cwd: root, encoding: "utf8" }
  );
  assert.equal(gradeV3.status, 0, gradeV3.stdout + gradeV3.stderr);
});

test("Deployment held-out event stream differs structurally and remains discriminating", () => {
  const out = `results/test/deployment-event-${process.pid}`;
  const result = spawnSync(
    process.execPath,
    [
      matrix,
      "examples/deployment-rollout-incident/task-pack.json",
      out,
      "examples/adapters/reference-agent.json",
      "examples/deployment-rollout-incident/event-streams/trigger-recovery-v1-v2-heldout-r2.json"
    ],
    { cwd: root, encoding: "utf8" }
  );

  assert.equal(result.status, 0, result.stdout + result.stderr);

  const summary = JSON.parse(
    fsSync.readFileSync(
      path.join(root, out, "event-stream-matrix-summary.json"),
      "utf8"
    )
  );
  const byPolicy = Object.fromEntries(
    summary.rows.map((row) => [row.policy, row])
  );

  assert.equal(byPolicy.static.finalCorrect, false);

  assert.equal(byPolicy.greedy.agentInvocationCount, 6);
  assert.equal(byPolicy.greedy.prePerturbationInvocationCount, 4);
  assert.equal(byPolicy.greedy.recoveryAttemptCount, 1);
  assert.equal(byPolicy.greedy.postRecoveryInvocationCount, 1);
  assert.equal(byPolicy.greedy.redundantInvocationCount, 5);
  assert.equal(byPolicy.greedy.recoveryTriggerLatencyMs, 0);

  assert.equal(byPolicy.plh_pressure.agentInvocationCount, 1);
  assert.equal(byPolicy.plh_pressure.redundantInvocationCount, 0);
  assert.equal(byPolicy.plh_pressure.recoveryTriggerLatencyMs, 0);
  assert.equal(byPolicy.plh_pressure.finalCorrect, true);

  assert.equal(byPolicy.plh_direct.agentInvocationCount, 1);
  assert.equal(byPolicy.plh_direct.redundantInvocationCount, 0);
  assert.equal(byPolicy.plh_direct.recoveryTriggerLatencyMs, 80000);
  assert.equal(byPolicy.plh_direct.finalCorrect, true);
});

