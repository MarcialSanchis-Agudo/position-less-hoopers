import assert from "node:assert/strict";
import test from "node:test";
import { buildCoordinationField } from "../src/index.mjs";

const t0 = "2026-09-25T00:00:00.000Z";
const t1 = "2026-09-25T00:01:00.000Z";

test("CourtShift-P2 worker loss turns covered work into uncovered work", () => {
  const before = buildCoordinationField({
    goalId: "g-worker-loss",
    agents: [{ sessionId: "s1", lifecycle: "active" }],
    work: [{ workId: "w1", status: "active", assignedSessionId: "s1" }]
  }, { observedAt: t0 });

  const after = buildCoordinationField({
    goalId: "g-worker-loss",
    agents: [{ sessionId: "s1", lifecycle: "stopped" }],
    work: [{ workId: "w1", status: "active", assignedSessionId: "s1" }]
  }, { observedAt: t1 });

  assert.equal(before.coverage[0].status, "covered");
  assert.equal(after.coverage[0].status, "uncovered");
  assert.equal(after.coverage[0].reason, "session_not_live");
  assert.deepEqual(after.uncovered, [{
    workId: "w1",
    reason: "session_not_live",
    sessionId: "s1"
  }]);
});

test("CourtShift-P4 external workspace conflict appears as contention, not merely overlap", () => {
  const baseInput = {
    goalId: "g-external-mutation",
    work: [
      { workId: "w1", status: "active", writeSet: ["src/config.ts"] },
      { workId: "w2", status: "active", readSet: ["src/config.ts"] }
    ]
  };

  const before = buildCoordinationField(baseInput, { observedAt: t0 });
  const after = buildCoordinationField({
    ...baseInput,
    contentions: [{
      workIds: ["w1", "w2"],
      refs: ["src/config.ts"],
      severity: "conflict",
      source: "belief_divergence"
    }]
  }, { observedAt: t1 });

  assert.equal(before.overlaps.length, 1);
  assert.equal(before.contentions.length, 0);
  assert.equal(after.overlaps.length, 1);
  assert.deepEqual(after.contentions, [{
    workIds: ["w1", "w2"],
    refs: ["src/config.ts"],
    severity: "conflict",
    source: "belief_divergence"
  }]);
});

test("CourtShift-P6 hidden integration failure becomes an explicit evidence gap", () => {
  const before = buildCoordinationField({
    goalId: "g-hidden-integration",
    work: [{
      workId: "w1",
      status: "active",
      evidenceStatus: null
    }]
  }, { observedAt: t0 });

  const after = buildCoordinationField({
    goalId: "g-hidden-integration",
    work: [{
      workId: "w1",
      status: "active",
      evidenceStatus: "incomplete"
    }]
  }, { observedAt: t1 });

  assert.deepEqual(before.evidenceGaps, []);
  assert.deepEqual(after.evidenceGaps, [{
    workId: "w1",
    type: "evidence_incomplete"
  }]);
});

