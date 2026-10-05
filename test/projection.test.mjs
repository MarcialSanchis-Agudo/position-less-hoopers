import assert from "node:assert/strict";
import test from "node:test";
import { buildCoordinationField } from "../src/index.mjs";

const observedAt = "2026-09-25T00:00:00.000Z";

function field(input = {}) {
  return buildCoordinationField(input, { observedAt });
}

test("P0-01: empty input produces a stable empty field", () => {
  assert.deepEqual(field({ goalId: "g1" }), {
    schemaVersion: 1,
    goalId: "g1",
    workflowRunId: null,
    observedAt,
    stateVersion: null,
    agents: [],
    work: [],
    coverage: [],
    overlaps: [],
    contentions: [],
    evidenceGaps: [],
    uncovered: [],
    resources: {
      activeAgentCount: 0,
      concurrencyLimit: null,
      knownCostUsd: null,
      budgetRemainingUsd: null
    },
    sourceRefs: {
      sessionIds: [],
      stepRunIds: [],
      harnessTransitionIds: []
    }
  });
});

test("P0-02: active work with a live assigned session is covered", () => {
  const result = field({
    goalId: "g1",
    agents: [{ sessionId: "s1", lifecycle: "active" }],
    work: [{ workId: "w1", status: "active", assignedSessionId: "s1" }]
  });

  assert.deepEqual(result.coverage, [{
    workId: "w1",
    status: "covered",
    sessionId: "s1",
    reason: null
  }]);
  assert.deepEqual(result.uncovered, []);
});

test("P0-03: active work without a session is uncovered", () => {
  const result = field({
    goalId: "g1",
    work: [{ workId: "w1", status: "active" }]
  });

  assert.equal(result.coverage[0].status, "uncovered");
  assert.equal(result.coverage[0].reason, "no_assigned_session");
  assert.equal(result.uncovered[0].workId, "w1");
});

test("P0-04: waiting-for-human work is not counted as uncovered", () => {
  const result = field({
    goalId: "g1",
    work: [{ workId: "w1", status: "waiting_human" }]
  });

  assert.deepEqual(result.coverage, []);
  assert.deepEqual(result.uncovered, []);
});

test("P0-05: blocked or stalled coverage is degraded, not silently covered", () => {
  const blocked = field({
    goalId: "g1",
    agents: [{ sessionId: "s1", lifecycle: "blocked" }],
    work: [{ workId: "w1", status: "active", assignedSessionId: "s1" }]
  });

  assert.equal(blocked.coverage[0].status, "degraded");
  assert.equal(blocked.coverage[0].reason, "blocked");

  const stalled = field({
    goalId: "g1",
    agents: [{
      sessionId: "s1",
      lifecycle: "active",
      progress: { stalled: true }
    }],
    work: [{ workId: "w1", status: "active", assignedSessionId: "s1" }]
  });

  assert.equal(stalled.coverage[0].status, "degraded");
  assert.equal(stalled.coverage[0].reason, "stalled");
});

test("P0-06: write/write overlap is detected structurally", () => {
  const result = field({
    goalId: "g1",
    work: [
      { workId: "b", status: "active", writeSet: ["src/a.ts", "src/shared.ts"] },
      { workId: "a", status: "active", writeSet: ["src/shared.ts", "src/z.ts"] }
    ]
  });

  assert.deepEqual(result.overlaps, [{
    leftWorkId: "a",
    rightWorkId: "b",
    kind: "write_write",
    refs: ["src/shared.ts"]
  }]);
});

test("P0-07: read/write overlap is detected in either direction", () => {
  const result = field({
    goalId: "g1",
    work: [
      { workId: "a", status: "active", readSet: ["src/shared.ts"] },
      { workId: "b", status: "active", writeSet: ["src/shared.ts"] }
    ]
  });

  assert.deepEqual(result.overlaps, [{
    leftWorkId: "a",
    rightWorkId: "b",
    kind: "read_write",
    refs: ["src/shared.ts"]
  }]);
});

test("P0-08: disjoint work has no structural overlap", () => {
  const result = field({
    goalId: "g1",
    work: [
      { workId: "a", status: "active", writeSet: ["src/a.ts"] },
      { workId: "b", status: "active", readSet: ["src/b.ts"] }
    ]
  });

  assert.deepEqual(result.overlaps, []);
});

test("P0-09: overlap alone does not imply contention", () => {
  const result = field({
    goalId: "g1",
    work: [
      { workId: "a", status: "active", writeSet: ["src/shared.ts"] },
      { workId: "b", status: "active", writeSet: ["src/shared.ts"] }
    ]
  });

  assert.equal(result.overlaps.length, 1);
  assert.deepEqual(result.contentions, []);
});

test("P0-10: authoritative belief-divergence contention is preserved and normalized", () => {
  const result = field({
    goalId: "g1",
    contentions: [{
      workIds: ["b", "a", "a"],
      refs: ["src/x.ts", "src/x.ts"],
      source: "belief_divergence",
      severity: "conflict"
    }]
  });

  assert.deepEqual(result.contentions, [{
    workIds: ["a", "b"],
    refs: ["src/x.ts"],
    severity: "conflict",
    source: "belief_divergence"
  }]);
});

test("P0-11: persisted evidence/refute states become explicit gaps", () => {
  const result = field({
    goalId: "g1",
    work: [
      { workId: "b", status: "active", refuteStatus: "unavailable" },
      { workId: "a", status: "active", evidenceStatus: "grounding_partial", refuteStatus: "uncertain" }
    ]
  });

  assert.deepEqual(result.evidenceGaps, [
    { workId: "a", type: "grounding_partial" },
    { workId: "a", type: "refute_uncertain" },
    { workId: "b", type: "refute_unavailable" }
  ]);
});

test("P0-12: output order is deterministic regardless of input order", () => {
  const inputA = {
    goalId: "g1",
    agents: [
      { sessionId: "s2", lifecycle: "active" },
      { sessionId: "s1", lifecycle: "active" }
    ],
    work: [
      { workId: "w2", status: "active", assignedSessionId: "s2", writeSet: ["b", "a"] },
      { workId: "w1", status: "active", assignedSessionId: "s1", readSet: ["b"] }
    ],
    sourceRefs: {
      harnessTransitionIds: ["t2", "t1", "t1"]
    }
  };

  const inputB = {
    ...inputA,
    agents: [...inputA.agents].reverse(),
    work: [...inputA.work].reverse(),
    sourceRefs: {
      harnessTransitionIds: [...inputA.sourceRefs.harnessTransitionIds].reverse()
    }
  };

  assert.deepEqual(field(inputA), field(inputB));
});

test("P0-13: source references are unique and sorted", () => {
  const result = field({
    goalId: "g1",
    agents: [{ sessionId: "s2" }, { sessionId: "s1" }],
    work: [{ workId: "w2" }, { workId: "w1" }],
    sourceRefs: { harnessTransitionIds: ["t2", "t1", "t2"] }
  });

  assert.deepEqual(result.sourceRefs, {
    sessionIds: ["s1", "s2"],
    stepRunIds: ["w1", "w2"],
    harnessTransitionIds: ["t1", "t2"]
  });
});

test("P0-14: resource counts do not invent missing budget or concurrency values", () => {
  const result = field({
    goalId: "g1",
    agents: [
      { sessionId: "s1", lifecycle: "active" },
      { sessionId: "s2", lifecycle: "blocked" },
      { sessionId: "s3", lifecycle: "stopped" }
    ],
    resources: {
      knownCostUsd: 1.25
    }
  });

  assert.deepEqual(result.resources, {
    activeAgentCount: 2,
    concurrencyLimit: null,
    knownCostUsd: 1.25,
    budgetRemainingUsd: null
  });
});

