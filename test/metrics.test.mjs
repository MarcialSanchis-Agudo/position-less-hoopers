import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCoordinationField,
  compareCoordinationFields,
  summarizeCoordinationField
} from "../src/index.mjs";

const observedAt = "2026-09-25T08:00:00.000Z";

test("metrics: coverage and structural counts summarize a field", () => {
  const field = buildCoordinationField({
    goalId: "g1",
    agents: [
      { sessionId: "s1", lifecycle: "active" },
      { sessionId: "s2", lifecycle: "blocked" }
    ],
    work: [
      {
        workId: "w1",
        status: "active",
        assignedSessionId: "s1",
        writeSet: ["shared"]
      },
      {
        workId: "w2",
        status: "active",
        assignedSessionId: "s2",
        writeSet: ["shared"],
        evidenceStatus: "incomplete"
      },
      {
        workId: "w3",
        status: "active"
      }
    ],
    contentions: [{
      workIds: ["w1", "w2"],
      refs: ["shared"],
      severity: "conflict",
      source: "state_deps"
    }],
    resources: { knownCostUsd: 1.5 }
  }, { observedAt });

  assert.deepEqual(summarizeCoordinationField(field), {
    schemaVersion: 1,
    goalId: "g1",
    workflowRunId: null,
    observedAt,
    activeAgentCount: 2,
    workCount: 3,
    expectedWorkCount: 3,
    coveredWorkCount: 1,
    degradedWorkCount: 1,
    uncoveredWorkCount: 1,
    coverageRatio: 1 / 3,
    overlapPairCount: 1,
    writeWriteOverlapCount: 1,
    readWriteOverlapCount: 0,
    contentionCount: 1,
    conflictContentionCount: 1,
    evidenceGapCount: 1,
    knownCostUsd: 1.5
  });
});

test("metrics: empty expected work yields null coverageRatio", () => {
  const field = buildCoordinationField({
    goalId: "g1",
    work: [{ workId: "w1", status: "waiting_human" }]
  }, { observedAt });

  assert.equal(summarizeCoordinationField(field).coverageRatio, null);
});

test("metrics: compareCoordinationFields reports perturbation deltas", () => {
  const before = buildCoordinationField({
    goalId: "g1",
    agents: [{ sessionId: "s1", lifecycle: "active" }],
    work: [{ workId: "w1", status: "active", assignedSessionId: "s1" }],
    resources: { knownCostUsd: 0.4 }
  }, { observedAt });

  const after = buildCoordinationField({
    goalId: "g1",
    agents: [{ sessionId: "s1", lifecycle: "stopped" }],
    work: [{ workId: "w1", status: "active", assignedSessionId: "s1" }],
    resources: { knownCostUsd: 0.6 }
  }, { observedAt: "2026-09-25T08:01:00.000Z" });

  const comparison = compareCoordinationFields(before, after);
  assert.equal(comparison.delta.coveredWorkCount, -1);
  assert.equal(comparison.delta.uncoveredWorkCount, 1);
  assert.equal(comparison.delta.activeAgentCount, -1);
  assert.ok(Math.abs(comparison.delta.knownCostUsd - 0.2) < 1e-12);
  assert.equal(comparison.delta.coverageRatio, -1);
});

