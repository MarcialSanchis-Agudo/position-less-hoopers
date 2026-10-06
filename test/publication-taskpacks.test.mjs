import assert from "node:assert/strict";
import fs from "node:fs";
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

const packs = [
  {
    id: "access-policy-incident",
    path: "examples/access-policy-incident/task-pack.json",
    cleanScenario: "access-policy-clean-v2",
    grader: "examples/access-policy-incident/grader/grade.mjs",
    v2: "examples/access-policy-incident/reference-solution/v2.mjs",
    v3: "examples/access-policy-incident/reference-solution/v3.mjs",
    destination: "src/access.mjs"
  },
  {
    id: "event-replay-incident",
    path: "examples/event-replay-incident/task-pack.json",
    cleanScenario: "event-replay-clean-v2",
    grader: "examples/event-replay-incident/grader/grade.mjs",
    v2: "examples/event-replay-incident/reference-solution/v2.mjs",
    v3: "examples/event-replay-incident/reference-solution/v3.mjs",
    destination: "src/replay.mjs"
  }
];

function run(script, args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8"
  });
}

for (const pack of packs) {
  test(`${pack.id}: manifest validates and seed separates v1 from v2/v3`, () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, pack.path), "utf8")
    );
    const validation = validateTaskPackManifest(manifest);
    assert.equal(validation.ok, true, validation.errors.join("; "));
    assert.equal(normalizeTaskPackManifest(manifest).taskPackId, pack.id);

    const out = `results/test/${pack.id}-grade-${process.pid}`;
    const prepared = run(prepare, [pack.path, out, "static"]);
    assert.equal(prepared.status, 0, prepared.stderr);

    const workspace = path.join(
      root,
      out,
      pack.cleanScenario,
      "static",
      "workspace"
    );
    const grader = path.join(root, pack.grader);

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

  test(`${pack.id}: reference solutions satisfy v2 then v3`, () => {
    const out = `results/test/${pack.id}-reference-${process.pid}`;
    const prepared = run(prepare, [pack.path, out, "plh_pressure"]);
    assert.equal(prepared.status, 0, prepared.stderr);

    const runRoot = path.join(
      root,
      out,
      pack.cleanScenario,
      "plh_pressure"
    );
    const workspace = path.join(runRoot, "workspace");
    const grader = path.join(root, pack.grader);

    const appliedV2 = run(applyReference, [
      path.relative(root, runRoot),
      pack.v2,
      pack.destination
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
      pack.v3,
      pack.destination
    ]);
    assert.equal(appliedV3.status, 0, appliedV3.stderr);

    const gradeV3 = spawnSync(
      process.execPath,
      [grader, workspace, "3"],
      { cwd: root, encoding: "utf8" }
    );
    assert.equal(gradeV3.status, 0, gradeV3.stdout + gradeV3.stderr);
  });
}

