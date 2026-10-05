import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const tasks = JSON.parse(
  fs.readFileSync(path.join(root, "experiments/context-reload/tasks.json"), "utf8")
).tasks;

test("context experiment: preparer creates matched warm/cold workspaces without touching local results", () => {
  const script = path.join(root, "scripts/prepare-context-reload.mjs");
  const relativeOut = `results/test/context-reload-harness-${process.pid}`;
  const outRoot = path.join(root, relativeOut);

  fs.rmSync(outRoot, { recursive: true, force: true });

  try {
    const result = spawnSync(process.execPath, [script, relativeOut], {
      cwd: root,
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);

    const index = JSON.parse(fs.readFileSync(path.join(outRoot, "index.json"), "utf8"));
    assert.equal(index.runs.length, tasks.length * 2);

    for (const task of tasks) {
      const warm = path.join(outRoot, task.taskId, "warm", "workspace");
      const cold = path.join(outRoot, task.taskId, "cold", "workspace");

      assert.equal(fs.existsSync(path.join(warm, "TASK.md")), true);
      assert.equal(fs.existsSync(path.join(cold, "TASK.md")), true);
      assert.equal(fs.existsSync(path.join(warm, "PLH_CONTEXT.md")), true);
      assert.equal(fs.existsSync(path.join(cold, "PLH_CONTEXT.md")), false);

      const warmTask = fs.readFileSync(path.join(warm, "TASK.md"), "utf8");
      const coldTask = fs.readFileSync(path.join(cold, "TASK.md"), "utf8");
      assert.equal(warmTask, coldTask);

      const warmMeta = JSON.parse(
        fs.readFileSync(path.join(outRoot, task.taskId, "warm", "run-meta.json"), "utf8")
      );
      const coldMeta = JSON.parse(
        fs.readFileSync(path.join(outRoot, task.taskId, "cold", "run-meta.json"), "utf8")
      );

      assert.equal(warmMeta.seedHash, coldMeta.seedHash);
      assert.equal(warmMeta.taskPromptHash, coldMeta.taskPromptHash);
      assert.equal(warmMeta.contextPackageHash, coldMeta.contextPackageHash);
      assert.match(warmMeta.seedHash, /^sha256:[a-f0-9]{64}$/);
      assert.match(warmMeta.taskPromptHash, /^sha256:[a-f0-9]{64}$/);
      assert.match(warmMeta.contextPackageHash, /^sha256:[a-f0-9]{64}$/);
    }
  } finally {
    fs.rmSync(outRoot, { recursive: true, force: true });
  }
});

