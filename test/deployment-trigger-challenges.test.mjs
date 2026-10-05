import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const matrix = path.join(root, "scripts/run-event-stream-matrix.mjs");
const freeze = JSON.parse(
  fs.readFileSync(
    path.join(root, "benchmarks/courtshift/trigger-challenge-v0.1.json"),
    "utf8"
  )
);

function runChallenge(streamPath, suffix, policies = null) {
  const out =
    `results/test/deployment-trigger-challenge-${suffix}-${process.pid}`;
  const args = [
    matrix,
    "examples/deployment-rollout-incident/task-pack.json",
    out,
    "examples/adapters/reference-agent.json",
    streamPath
  ];
  if (policies) args.push(policies);

  const result = spawnSync(
    process.execPath,
    args,
    { cwd: root, encoding: "utf8" }
  );

  assert.equal(result.status, 0, result.stdout + result.stderr);

  const summary = JSON.parse(
    fs.readFileSync(
      path.join(root, out, "event-stream-matrix-summary.json"),
      "utf8"
    )
  );

  return Object.fromEntries(summary.rows.map((row) => [row.policy, row]));
}

test("deployment trigger challenge: direct-only exposes pressure miss", () => {
  const challenge = freeze.streams[0];
  const byPolicy = runChallenge(challenge.path, "direct-only");

  assert.equal(byPolicy.greedy.agentInvocationCount, 5);
  assert.equal(
    byPolicy.greedy.recoveryTriggerEventId,
    "explicit-contract-mismatch"
  );
  assert.equal(byPolicy.greedy.recoveryTriggerLatencyMs, 0);
  assert.equal(byPolicy.greedy.finalCorrect, true);

  assert.equal(byPolicy.plh_direct.agentInvocationCount, 1);
  assert.equal(
    byPolicy.plh_direct.recoveryTriggerEventId,
    "explicit-contract-mismatch"
  );
  assert.equal(byPolicy.plh_direct.recoveryTriggerLatencyMs, 0);
  assert.equal(byPolicy.plh_direct.finalCorrect, true);

  assert.equal(byPolicy.plh_pressure.agentInvocationCount, 0);
  assert.equal(byPolicy.plh_pressure.recoveryTriggerEventId, null);
  assert.equal(byPolicy.plh_pressure.recoveryTriggerLatencyMs, null);
  assert.equal(byPolicy.plh_pressure.finalCorrect, false);

  assert.equal(byPolicy.static.agentInvocationCount, 0);
  assert.equal(byPolicy.static.finalCorrect, false);
});

test(
  "deployment trigger challenge: delayed pressure lands between greedy and direct",
  () => {
    const challenge = freeze.streams[1];
    const byPolicy = runChallenge(challenge.path, "delayed-pressure");

    assert.equal(byPolicy.greedy.agentInvocationCount, 7);
    assert.equal(
      byPolicy.greedy.recoveryTriggerEventId,
      "rollout-contract-mismatch"
    );
    assert.equal(byPolicy.greedy.recoveryTriggerLatencyMs, 0);
    assert.equal(byPolicy.greedy.finalCorrect, true);

    assert.equal(byPolicy.plh_pressure.agentInvocationCount, 1);
    assert.equal(
      byPolicy.plh_pressure.recoveryTriggerEventId,
      "corroborated-rollout-risk"
    );
    assert.equal(byPolicy.plh_pressure.recoveryTriggerLatencyMs, 50000);
    assert.equal(byPolicy.plh_pressure.finalCorrect, true);

    assert.equal(byPolicy.plh_direct.agentInvocationCount, 1);
    assert.equal(
      byPolicy.plh_direct.recoveryTriggerEventId,
      "explicit-rollout-blocked"
    );
    assert.equal(byPolicy.plh_direct.recoveryTriggerLatencyMs, 80000);
    assert.equal(byPolicy.plh_direct.finalCorrect, true);

    assert.equal(byPolicy.static.agentInvocationCount, 0);
    assert.equal(byPolicy.static.finalCorrect, false);
  }
);

test("deployment trigger challenge: hybrid closes the direct-only miss", () => {
  const challenge = freeze.streams[0];
  const byPolicy = runChallenge(
    challenge.path,
    "direct-only-hybrid",
    "plh_hybrid"
  );

  assert.equal(byPolicy.plh_hybrid.agentInvocationCount, 1);
  assert.equal(
    byPolicy.plh_hybrid.recoveryTriggerEventId,
    "explicit-contract-mismatch"
  );
  assert.equal(byPolicy.plh_hybrid.recoveryTriggerLatencyMs, 0);
  assert.equal(byPolicy.plh_hybrid.finalCorrect, true);
});

test("deployment trigger challenge: naive hybrid exposes post-recovery duplicate", () => {
  const challenge = freeze.streams[1];
  const byPolicy = runChallenge(
    challenge.path,
    "delayed-pressure-hybrid",
    "plh_hybrid"
  );

  assert.equal(byPolicy.plh_hybrid.agentInvocationCount, 2);
  assert.equal(
    byPolicy.plh_hybrid.recoveryTriggerEventId,
    "corroborated-rollout-risk"
  );
  assert.equal(byPolicy.plh_hybrid.recoveryTriggerLatencyMs, 50000);
  assert.equal(byPolicy.plh_hybrid.postRecoveryInvocationCount, 1);
  assert.equal(byPolicy.plh_hybrid.redundantInvocationCount, 1);
  assert.equal(byPolicy.plh_hybrid.finalCorrect, true);
});

test("deployment trigger challenge: guarded hybrid keeps direct-only recovery", () => {
  const challenge = freeze.streams[0];
  const byPolicy = runChallenge(
    challenge.path,
    "direct-only-hybrid-guarded",
    "plh_hybrid_guarded"
  );

  assert.equal(byPolicy.plh_hybrid_guarded.policyRecomputationCount, 1);
  assert.equal(byPolicy.plh_hybrid_guarded.agentInvocationCount, 1);
  assert.equal(byPolicy.plh_hybrid_guarded.suppressedExecutionCount, 0);
  assert.equal(
    byPolicy.plh_hybrid_guarded.recoveryTriggerEventId,
    "explicit-contract-mismatch"
  );
  assert.equal(byPolicy.plh_hybrid_guarded.recoveryTriggerLatencyMs, 0);
  assert.equal(byPolicy.plh_hybrid_guarded.finalCorrect, true);
});

test("deployment trigger challenge: guarded hybrid suppresses resolved duplicate", () => {
  const challenge = freeze.streams[1];
  const byPolicy = runChallenge(
    challenge.path,
    "delayed-pressure-hybrid-guarded",
    "plh_hybrid_guarded"
  );

  assert.equal(byPolicy.plh_hybrid_guarded.policyRecomputationCount, 2);
  assert.equal(byPolicy.plh_hybrid_guarded.agentInvocationCount, 1);
  assert.equal(byPolicy.plh_hybrid_guarded.suppressedExecutionCount, 1);
  assert.equal(
    byPolicy.plh_hybrid_guarded.recoveryTriggerEventId,
    "corroborated-rollout-risk"
  );
  assert.equal(byPolicy.plh_hybrid_guarded.recoveryTriggerLatencyMs, 50000);
  assert.equal(byPolicy.plh_hybrid_guarded.postRecoveryInvocationCount, 0);
  assert.equal(byPolicy.plh_hybrid_guarded.redundantInvocationCount, 0);
  assert.equal(byPolicy.plh_hybrid_guarded.finalCorrect, true);
});

test("deployment trigger challenge: guarded hybrid reopens after real regression", () => {
  const byPolicy = runChallenge(
    "examples/deployment-rollout-incident/event-streams/challenge-refailure-after-recovery-v1.json",
    "refailure-hybrid-guarded",
    "plh_hybrid_guarded"
  );

  assert.equal(byPolicy.plh_hybrid_guarded.policyRecomputationCount, 3);
  assert.equal(byPolicy.plh_hybrid_guarded.agentInvocationCount, 2);
  assert.equal(byPolicy.plh_hybrid_guarded.suppressedExecutionCount, 1);
  assert.equal(byPolicy.plh_hybrid_guarded.recoveryAttemptCount, 2);
  assert.equal(byPolicy.plh_hybrid_guarded.postRecoveryInvocationCount, 1);
  assert.equal(byPolicy.plh_hybrid_guarded.redundantInvocationCount, 0);
  assert.equal(
    byPolicy.plh_hybrid_guarded.recoveryTriggerEventId,
    "corroborated-rollout-risk"
  );
  assert.equal(byPolicy.plh_hybrid_guarded.recoveryTriggerLatencyMs, 50000);
  assert.equal(byPolicy.plh_hybrid_guarded.finalCorrect, true);
});

