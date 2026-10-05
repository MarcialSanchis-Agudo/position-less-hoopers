import assert from "node:assert/strict";
import fsSync from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

test("Config Migration event stream produces policy-distinct behavior", () => {
  const out =
    `results/test/config-event-stream-${process.pid}`;

  const result = spawnSync(
    process.execPath,
    [
      path.join(root, "scripts/run-event-stream-matrix.mjs"),
      "examples/config-migration-incident/task-pack.json",
      out,
      "examples/adapters/reference-agent.json",
      "examples/config-migration-incident/event-streams/trigger-recovery-v1-v2.json"
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
  assert.equal(byPolicy.greedy.agentInvocationCount, 5);
  assert.equal(byPolicy.greedy.prePerturbationInvocationCount, 3);
  assert.equal(byPolicy.greedy.recoveryAttemptCount, 1);
  assert.equal(byPolicy.greedy.postRecoveryInvocationCount, 1);
  assert.equal(byPolicy.greedy.redundantInvocationCount, 4);
  assert.equal(byPolicy.greedy.unnecessaryInvocationCount, 3);
  assert.equal(byPolicy.plh_pressure.agentInvocationCount, 1);
  assert.equal(byPolicy.plh_pressure.recoveryTriggerLatencyMs, 0);
  assert.equal(byPolicy.plh_direct.agentInvocationCount, 1);
  assert.equal(byPolicy.plh_direct.recoveryTriggerLatencyMs, 60000);
  assert.equal(byPolicy.plh_pressure.finalCorrect, true);
  assert.equal(byPolicy.plh_direct.finalCorrect, true);
});

