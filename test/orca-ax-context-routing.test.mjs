import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const runner = path.join(
  root,
  "scripts/run-orca-ax-context-routing-comparison.mjs"
);

test("ORCA AX context routing: capability-only and situated modes diverge as frozen", () => {
  const out = `results/test/orca-ax-context-routing-${process.pid}`;
  const result = spawnSync(
    process.execPath,
    [
      runner,
      "benchmarks/courtshift/orca-ax-context-routing-v0.json",
      out,
      "examples/adapters/reference-agent.json",
      "2"
    ],
    { cwd: root, encoding: "utf8" }
  );

  assert.equal(result.status, 0, result.stdout + result.stderr);

  const summary = JSON.parse(
    fs.readFileSync(
      path.join(root, out, "orca-ax-context-routing-comparison-summary.json"),
      "utf8"
    )
  );

  assert.equal(summary.failedRunCount, 0);

  const capability = summary.byMatcherMode.find(
    (row) => row.matcherMode === "capability"
  );
  const situated = summary.byMatcherMode.find(
    (row) => row.matcherMode === "capability_situated"
  );

  assert.equal(capability.runCount, 2);
  assert.equal(situated.runCount, 2);
  assert.equal(capability.successCount, 2);
  assert.equal(situated.successCount, 2);

  for (const sequence of capability.assignmentSequences) {
    assert.deepEqual(sequence, ["agent-a", "agent-a"]);
  }
  for (const sequence of situated.assignmentSequences) {
    assert.deepEqual(sequence, ["agent-b", "agent-a"]);
  }

  assert.equal(capability.contextMisalignedAssignmentCount.mean, 1);
  assert.equal(situated.contextMisalignedAssignmentCount.mean, 0);
  assert.equal(capability.suppressedExecutionCount.mean, 1);
  assert.equal(situated.suppressedExecutionCount.mean, 1);
  assert.equal(capability.agentInvocationCount.mean, 2);
  assert.equal(situated.agentInvocationCount.mean, 2);
});
