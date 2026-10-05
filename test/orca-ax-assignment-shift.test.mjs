import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const runner = path.join(root, "scripts/run-orca-ax-assignment-shift.mjs");

test("ORCA AX vertical slice: guarded wake-up drives state-responsive assignment", () => {
  const out = `results/test/orca-ax-assignment-shift-${process.pid}`;
  const result = spawnSync(
    process.execPath,
    [
      runner,
      "benchmarks/courtshift/orca-ax-assignment-shift-v0.json",
      out,
      "examples/adapters/reference-agent.json"
    ],
    { cwd: root, encoding: "utf8" }
  );

  assert.equal(result.status, 0, result.stdout + result.stderr);

  const summary = JSON.parse(
    fs.readFileSync(
      path.join(root, out, "orca-ax-assignment-shift-summary.json"),
      "utf8"
    )
  );

  assert.deepEqual(summary.assignmentSequence, ["agent-b", "agent-a"]);
  assert.deepEqual(
    summary.assignmentSequence,
    summary.predictedAssignmentSequence
  );
  assert.equal(summary.needCount, 2);
  assert.equal(summary.satisfiedNeedCount, 2);
  assert.equal(summary.policyRecomputationCount, 3);
  assert.equal(summary.agentInvocationCount, 2);
  assert.equal(summary.suppressedExecutionCount, 1);
  assert.equal(summary.finalCorrect, true);
  assert.equal(summary.evidenceSatisfied, true);

  assert.equal(summary.assignments[0].eventId, "corroborated-rollout-risk");
  assert.equal(summary.assignments[0].assigneeId, "agent-b");
  assert.equal(summary.assignments[1].eventId, "regression-confirmed");
  assert.equal(summary.assignments[1].assigneeId, "agent-a");

  assert.equal(summary.executions[0].finishStatus, "need_satisfied");
  assert.equal(summary.executions[1].finishStatus, "need_satisfied");
  assert.equal(summary.suppressedExecutions[0].eventId, "explicit-rollout-blocked");
});

