import assert from "node:assert/strict";
import fsSync from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

test("event-stream replicate runner aggregates repeated matrices", () => {
  const out =
    `results/test/event-stream-replicates-${process.pid}`;

  const result = spawnSync(
    process.execPath,
    [
      path.join(root, "scripts/run-event-stream-replicates.mjs"),
      "examples/checkout-incident/task-pack.json",
      out,
      "examples/adapters/reference-agent.json",
      "examples/checkout-incident/event-streams/trigger-recovery-v1-v2.json",
      "2"
    ],
    { cwd: root, encoding: "utf8" }
  );

  assert.equal(result.status, 0, result.stdout + result.stderr);

  const summary = JSON.parse(
    fsSync.readFileSync(
      path.join(
        root,
        out,
        "event-stream-replicates-summary.json"
      ),
      "utf8"
    )
  );

  assert.equal(summary.repeats, 2);
  assert.equal(summary.failedReplicateCount, 0);

  const greedy = summary.byPolicy.find(
    (row) => row.policy === "greedy"
  );
  const pressure = summary.byPolicy.find(
    (row) => row.policy === "plh_pressure"
  );

  assert.equal(greedy.runCount, 2);
  assert.equal(greedy.agentInvocationCount.mean, 5);
  assert.equal(greedy.redundantInvocationCount.mean, 4);
  assert.equal(pressure.agentInvocationCount.mean, 1);
  assert.equal(pressure.redundantInvocationCount.mean, 0);
  assert.equal(pressure.recoveryTriggerLatencyMs.mean, 0);
});

