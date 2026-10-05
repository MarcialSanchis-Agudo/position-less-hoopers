import assert from "node:assert/strict";
import test from "node:test";
import {
  activeResponsibilitiesForNeed,
  admitNeedProposal,
  assignNeed,
  endResponsibilityWithoutCompletion,
  finishResponsibility,
  startResponsibility
} from "../src/index.mjs";

function admittedNeed(overrides = {}) {
  return admitNeedProposal({
    goalId: "g1",
    objective: "Implement cache invalidation fix",
    rationale: "Current state exposes uncovered implementation work",
    stateVersion: "v1",
    requirements: {
      capabilities: ["implement"],
      toolAccess: ["filesystem"],
      permissions: ["workspace-write"],
      contextRefs: ["src/cache.mjs"]
    },
    coverage: {
      targetRefs: ["src/cache.mjs"],
      evidenceTypes: ["test"],
      mutationScopes: ["src/cache.mjs"]
    },
    urgency: 0.8,
    importance: 0.9,
    uncertainty: 0.2,
    risk: 0.2,
    expectedInformationGain: 0.3,
    redundancyPolicy: "exclusive",
    evidenceObligations: ["test:cache"],
    exitConditions: ["cache-tests-pass"],
    createdBy: "deterministic_signal",
    ...overrides
  }, [], {
    now: "2026-09-28T12:00:00.000Z"
  }).need;
}

function candidates() {
  return [
    {
      id: "agent-a",
      capabilities: ["implement"],
      tools: ["filesystem"],
      permissions: ["workspace-write"],
      capabilityScores: { implement: 0.92 },
      contextRefs: [],
      available: true
    },
    {
      id: "agent-b",
      capabilities: ["implement"],
      tools: ["filesystem"],
      permissions: ["workspace-write"],
      capabilityScores: { implement: 0.84 },
      contextRefs: ["src/cache.mjs"],
      available: true
    }
  ];
}

function assign(need, existingResponsibilities = [], overrides = {}) {
  return assignNeed({
    need,
    candidates: candidates(),
    existingResponsibilities,
    matcherOptions: { mode: "capability_situated" },
    assignmentVersion: 1,
    authority: {
      investigate: true,
      propose: true,
      execute: true,
      requestHelp: true,
      mutateScopes: ["src/cache.mjs"]
    },
    offeredAt: "2026-09-28T12:01:00.000Z",
    renewAfter: "2026-09-28T12:06:00.000Z",
    expiresAt: "2026-09-28T12:11:00.000Z",
    ...overrides
  });
}

test("P2.5 cycle: Need requirements feed the P1 matcher and create a leased responsibility", () => {
  const need = admittedNeed();
  const result = assign(need);

  assert.equal(result.status, "assigned");
  assert.equal(result.need.status, "assigned");
  assert.equal(result.responsibility.status, "offered");
  assert.equal(result.responsibility.needId, need.id);
  assert.equal(result.responsibility.assigneeId, "agent-b");
  assert.equal(result.decision.selectedCandidateId, "agent-b");
  assert.deepEqual(result.events.map((event) => event.type), ["AssignmentDecision"]);
});

test("P2.5 cycle: no feasible candidate blocks but preserves the Need", () => {
  const need = admittedNeed();
  const result = assignNeed({
    need,
    candidates: [{
      id: "agent-x",
      capabilities: ["research"],
      tools: [],
      permissions: [],
      available: true
    }],
    offeredAt: "2026-09-28T12:01:00.000Z",
    renewAfter: "2026-09-28T12:06:00.000Z",
    expiresAt: "2026-09-28T12:11:00.000Z"
  });

  assert.equal(result.status, "unassigned");
  assert.equal(result.need.id, need.id);
  assert.equal(result.need.status, "blocked");
  assert.equal(result.responsibility, null);
  assert.equal(result.events[0].type, "AssignmentDeferred");
});

test("P2.5 cycle: start activates both responsibility and Need", () => {
  const assigned = assign(admittedNeed());
  const started = startResponsibility({
    need: assigned.need,
    responsibility: assigned.responsibility,
    acceptedAt: "2026-09-28T12:02:00.000Z",
    activatedAt: "2026-09-28T12:03:00.000Z"
  });

  assert.equal(started.need.status, "active");
  assert.equal(started.responsibility.status, "active");
  assert.equal(started.events[0].type, "ResponsibilityActivated");
});

test("P2.5 cycle: completion with evidence satisfies the Need", () => {
  const assigned = assign(admittedNeed());
  const started = startResponsibility({
    need: assigned.need,
    responsibility: assigned.responsibility,
    acceptedAt: "2026-09-28T12:02:00.000Z"
  });

  const finished = finishResponsibility({
    need: started.need,
    responsibility: started.responsibility,
    completedAt: "2026-09-28T12:05:00.000Z",
    evidenceRefs: ["test:cache"]
  });

  assert.equal(finished.status, "need_satisfied");
  assert.equal(finished.responsibility.status, "completed");
  assert.equal(finished.need.status, "satisfied");
  assert.deepEqual(
    finished.events.map((event) => event.type),
    ["ResponsibilityCompleted", "NeedSatisfied"]
  );
});

test("P2.5 cycle: completion without evidence reopens unresolved Need", () => {
  const assigned = assign(admittedNeed());
  const started = startResponsibility({
    need: assigned.need,
    responsibility: assigned.responsibility,
    acceptedAt: "2026-09-28T12:02:00.000Z"
  });

  const finished = finishResponsibility({
    need: started.need,
    responsibility: started.responsibility,
    completedAt: "2026-09-28T12:05:00.000Z",
    evidenceRefs: []
  });

  assert.equal(finished.status, "need_reopened");
  assert.equal(finished.responsibility.status, "completed");
  assert.equal(finished.need.status, "open");
  assert.equal(
    finished.need.statusReason,
    "responsibility_completed_without_need_satisfaction"
  );
  assert.equal(finished.events[1].type, "NeedReopened");
});

test("P2.5 cycle: released responsibility reopens Need for reassignment", () => {
  const assigned = assign(admittedNeed());
  const started = startResponsibility({
    need: assigned.need,
    responsibility: assigned.responsibility,
    acceptedAt: "2026-09-28T12:02:00.000Z"
  });

  const ended = endResponsibilityWithoutCompletion({
    need: started.need,
    responsibility: started.responsibility,
    endedAt: "2026-09-28T12:04:00.000Z",
    kind: "released",
    reason: "blocked"
  });

  assert.equal(ended.responsibility.status, "released");
  assert.equal(ended.need.status, "open");
  assert.equal(ended.events[1].type, "NeedReopened");
});

test("P2.5 cycle: exclusive Need prevents accidental duplicate live responsibility", () => {
  const need = admittedNeed();
  const first = assign(need);
  const started = startResponsibility({
    need: first.need,
    responsibility: first.responsibility,
    acceptedAt: "2026-09-28T12:02:00.000Z"
  });

  const second = assign(started.need, [started.responsibility], {
    assignmentVersion: 2,
    offeredAt: "2026-09-28T12:03:00.000Z",
    renewAfter: "2026-09-28T12:08:00.000Z",
    expiresAt: "2026-09-28T12:13:00.000Z"
  });

  assert.equal(activeResponsibilitiesForNeed(started.need, [started.responsibility]).length, 1);
  assert.equal(second.status, "already_covered");
  assert.equal(second.responsibility, null);
});

test("P2.5 cycle: independent duplicate Need permits intentional second responsibility", () => {
  const need = admittedNeed({ redundancyPolicy: "independent_duplicate" });
  const first = assign(need);
  const started = startResponsibility({
    need: first.need,
    responsibility: first.responsibility,
    acceptedAt: "2026-09-28T12:02:00.000Z"
  });

  const second = assign(started.need, [started.responsibility], {
    assignmentVersion: 2,
    offeredAt: "2026-09-28T12:03:00.000Z",
    renewAfter: "2026-09-28T12:08:00.000Z",
    expiresAt: "2026-09-28T12:13:00.000Z"
  });

  assert.equal(second.status, "assigned");
  assert.ok(second.responsibility);
  assert.equal(second.responsibility.assignmentVersion, 2);
});

test("P2.5 cycle: reassignment after release preserves Need identity", () => {
  const need = admittedNeed();
  const first = assign(need);
  const started = startResponsibility({
    need: first.need,
    responsibility: first.responsibility,
    acceptedAt: "2026-09-28T12:02:00.000Z"
  });
  const ended = endResponsibilityWithoutCompletion({
    need: started.need,
    responsibility: started.responsibility,
    endedAt: "2026-09-28T12:04:00.000Z",
    kind: "released",
    reason: "blocked"
  });

  const reassigned = assign(ended.need, [ended.responsibility], {
    assignmentVersion: 2,
    offeredAt: "2026-09-28T12:05:00.000Z",
    renewAfter: "2026-09-28T12:10:00.000Z",
    expiresAt: "2026-09-28T12:15:00.000Z",
    handoffFrom: ended.responsibility.assigneeId,
    handoffReason: "blocked"
  });

  assert.equal(reassigned.status, "assigned");
  assert.equal(reassigned.need.id, need.id);
  assert.equal(reassigned.responsibility.needId, need.id);
  assert.equal(reassigned.responsibility.assignmentVersion, 2);
});

