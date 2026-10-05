import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptResponsibility,
  activateResponsibility,
  admitNeedProposal,
  completeResponsibility,
  createResponsibilityOffer,
  releaseResponsibility,
  renewResponsibility,
  responsibilityCoversNeed,
  responsibilityExpired,
  revokeResponsibility,
  satisfyNeed
} from "../src/index.mjs";

function need() {
  return admitNeedProposal({
    goalId: "g1",
    objective: "Implement budget guard",
    rationale: "Current state exposes uncovered implementation work",
    stateVersion: "v1",
    urgency: 0.5,
    importance: 0.8,
    uncertainty: 0.2,
    risk: 0.2,
    expectedInformationGain: 0.2,
    redundancyPolicy: "exclusive",
    evidenceObligations: ["test:budget"],
    exitConditions: ["budget-tests-pass"],
    createdBy: "deterministic_signal"
  }).need;
}

function offer(overrides = {}) {
  return createResponsibilityOffer({
    id: "r1",
    need: need(),
    assigneeId: "agent-a",
    assignmentVersion: 1,
    authority: {
      investigate: true,
      propose: true,
      execute: true,
      requestHelp: true,
      mutateScopes: ["src/budget.mjs"]
    },
    offeredAt: "2026-09-28T10:00:00.000Z",
    renewAfter: "2026-09-28T10:05:00.000Z",
    expiresAt: "2026-09-28T10:10:00.000Z",
    ...overrides
  });
}

test("P2 Responsibility: explicit authority and lease are created", () => {
  const responsibility = offer();

  assert.equal(responsibility.status, "offered");
  assert.equal(responsibility.authority.execute, true);
  assert.deepEqual(responsibility.authority.mutateScopes, ["src/budget.mjs"]);
  assert.deepEqual(responsibility.evidenceObligations, ["test:budget"]);
});

test("P2 Responsibility: terminal Need cannot receive a new lease", () => {
  const terminal = satisfyNeed(need(), ["test:budget"], {
    now: "2026-09-28T10:00:00.000Z"
  }).need;

  assert.throws(
    () => createResponsibilityOffer({
      id: "r2",
      need: terminal,
      assigneeId: "agent-b",
      assignmentVersion: 1,
      offeredAt: "2026-09-28T10:01:00.000Z",
      renewAfter: "2026-09-28T10:02:00.000Z",
      expiresAt: "2026-09-28T10:03:00.000Z"
    }),
    /terminal Need/
  );
});

test("P2 Responsibility: offer can be accepted and activated before expiry", () => {
  const accepted = acceptResponsibility(offer(), "2026-09-28T10:01:00.000Z");
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.acquiredAt, "2026-09-28T10:01:00.000Z");

  const active = activateResponsibility(accepted, "2026-09-28T10:02:00.000Z");
  assert.equal(active.status, "active");
});

test("P2 Responsibility: expiry blocks activation and renewal", () => {
  const responsibility = offer();
  assert.equal(
    responsibilityExpired(responsibility, "2026-09-28T10:10:00.000Z"),
    true
  );

  assert.throws(
    () => activateResponsibility(responsibility, "2026-09-28T10:10:00.000Z"),
    /expired/
  );

  const accepted = acceptResponsibility(responsibility, "2026-09-28T10:01:00.000Z");
  assert.throws(
    () => renewResponsibility(accepted, {
      now: "2026-09-28T10:10:00.000Z",
      renewAfter: "2026-09-28T10:15:00.000Z",
      expiresAt: "2026-09-28T10:20:00.000Z"
    }),
    /expired/
  );
});

test("P2 Responsibility: renewal extends an active lease deterministically", () => {
  const active = activateResponsibility(offer(), "2026-09-28T10:01:00.000Z");
  const renewed = renewResponsibility(active, {
    now: "2026-09-28T10:04:00.000Z",
    renewAfter: "2026-09-28T10:09:00.000Z",
    expiresAt: "2026-09-28T10:14:00.000Z"
  });

  assert.equal(renewed.status, "active");
  assert.equal(renewed.expiresAt, "2026-09-28T10:14:00.000Z");
});

test("P2 Responsibility: complete/release/revoke are terminal lease outcomes", () => {
  const active = activateResponsibility(offer(), "2026-09-28T10:01:00.000Z");

  const completed = completeResponsibility(active, "2026-09-28T10:02:00.000Z");
  assert.equal(completed.status, "completed");

  const released = releaseResponsibility(active, "2026-09-28T10:02:00.000Z", "handoff");
  assert.equal(released.status, "released");
  assert.equal(released.releaseReason, "handoff");

  const revoked = revokeResponsibility(active, "2026-09-28T10:02:00.000Z", "policy");
  assert.equal(revoked.status, "revoked");
  assert.equal(revoked.releaseReason, "policy");
});

test("P2 Responsibility: completion does not satisfy the Need", () => {
  const n = need();
  const responsibility = createResponsibilityOffer({
    id: "r1",
    need: n,
    assigneeId: "agent-a",
    assignmentVersion: 1,
    offeredAt: "2026-09-28T10:00:00.000Z",
    renewAfter: "2026-09-28T10:05:00.000Z",
    expiresAt: "2026-09-28T10:10:00.000Z"
  });
  const completed = completeResponsibility(
    activateResponsibility(responsibility, "2026-09-28T10:01:00.000Z"),
    "2026-09-28T10:02:00.000Z"
  );

  assert.equal(completed.status, "completed");
  assert.equal(n.status, "open");
});

test("P2 Responsibility: active lease covers a nonterminal Need only", () => {
  const n = need();
  const active = activateResponsibility(offer(), "2026-09-28T10:01:00.000Z");
  assert.equal(responsibilityCoversNeed(active, n), true);

  const satisfied = satisfyNeed(n, ["test:budget"], {
    now: "2026-09-28T10:02:00.000Z"
  }).need;
  assert.equal(responsibilityCoversNeed(active, satisfied), false);
});

