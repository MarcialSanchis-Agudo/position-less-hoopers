import assert from "node:assert/strict";
import test from "node:test";
import {
  summarizeContextReloadExperiment,
  summarizeContextReloadPair,
  validateContextReloadRun
} from "../src/index.mjs";

function run(condition, overrides = {}) {
  return {
    schemaVersion: 1,
    runId: `p1-${condition}`,
    pairId: "p1",
    taskId: "t1",
    condition,
    modelId: "m1",
    contextPackageHash: "h1",
    startedAt: "2026-09-28T08:00:00.000Z",
    finishedAt: condition === "warm"
      ? "2026-09-28T08:00:30.000Z"
      : "2026-09-28T08:00:50.000Z",
    inputTokens: condition === "warm" ? 1000 : 1800,
    outputTokens: condition === "warm" ? 400 : 500,
    toolCalls: condition === "warm" ? 5 : 9,
    fileReads: condition === "warm" ? 3 : 7,
    repeatedFileReads: condition === "warm" ? 0 : 2,
    staleStateActions: 0,
    timeToFirstUsefulActionMs: condition === "warm" ? 7000 : 16000,
    correct: true,
    ...overrides
  };
}

test("context reload: valid run passes validation", () => {
  assert.deepEqual(validateContextReloadRun(run("warm")), {
    ok: true,
    errors: []
  });
});

test("context reload: pair computes cold-minus-warm deltas", () => {
  const summary = summarizeContextReloadPair(run("warm"), run("cold"));

  assert.equal(summary.delta.inputTokens, 800);
  assert.equal(summary.delta.totalTokens, 900);
  assert.equal(summary.delta.toolCalls, 4);
  assert.equal(summary.delta.fileReads, 4);
  assert.equal(summary.delta.repeatedFileReads, 2);
  assert.equal(summary.delta.durationMs, 20000);
  assert.equal(summary.delta.timeToFirstUsefulActionMs, 9000);
});

test("context reload: experiment aggregates matched pairs", () => {
  const runs = [
    run("warm"),
    run("cold"),
    run("warm", { pairId: "p2", runId: "p2-warm", inputTokens: 900 }),
    run("cold", { pairId: "p2", runId: "p2-cold", inputTokens: 1500 })
  ];

  const result = summarizeContextReloadExperiment(runs);

  assert.equal(result.pairs.length, 2);
  assert.equal(result.aggregate.inputTokens.n, 2);
  assert.equal(result.aggregate.inputTokens.mean, 700);
  assert.equal(result.aggregate.correctness.warmCorrect, 2);
  assert.equal(result.aggregate.correctness.coldCorrect, 2);
});

test("context reload: incomplete pair is rejected", () => {
  assert.throws(
    () => summarizeContextReloadExperiment([run("warm")]),
    /Incomplete warm\/cold pair/
  );
});

test("context reload: mismatched model within a pair is rejected", () => {
  assert.throws(
    () => summarizeContextReloadPair(
      run("warm"),
      run("cold", { modelId: "m2" })
    ),
    /modelId mismatch/
  );
});

