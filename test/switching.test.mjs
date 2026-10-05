import assert from "node:assert/strict";
import test from "node:test";
import {
  admitNeedProposal,
  assignNeed,
  evaluateSwitch,
  executeSwitch,
  startResponsibility
} from "../src/index.mjs";

function need() {
  return admitNeedProposal({
    goalId: "g-switch",
    objective: "Repair checkout path",
    rationale: "Switching test",
    stateVersion: "v1",
    requirements: {
      capabilities: ["implement"],
      contextRefs: ["src/checkout.mjs"]
    },
    coverage: {
      targetRefs: ["src/checkout.mjs"],
      mutationScopes: ["src/checkout.mjs"]
    },
    urgency: 0.8,
    importance: 0.9,
    uncertainty: 0.2,
    risk: 0.3,
    expectedInformationGain: 0.2,
    redundancyPolicy: "exclusive",
    evidenceObligations: ["test:checkout"],
    exitConditions: ["checkout-tests-pass"],
    createdBy: "deterministic_signal"
  }, [], {
    id: "need-switch",
    now: "2026-09-28T15:00:00.000Z"
  }).need;
}

function initialActive() {
  const n = need();
  const assigned = assignNeed({
    need: n,
    candidates: [{
      id: "a",
      capabilities: ["implement"],
      capabilityScores: { implement: 0.9 },
      contextRefs: ["src/checkout.mjs"],
      available: true
    }],
    matcherOptions: { mode: "capability_situated" },
    assignmentVersion: 1,
    authority: {
      investigate: true,
      propose: true,
      execute: true,
      requestHelp: true,
      mutateScopes: ["src/checkout.mjs"]
    },
    offeredAt: "2026-09-28T15:00:00.000Z",
    renewAfter: "2026-09-28T15:05:00.000Z",
    expiresAt: "2026-09-28T15:10:00.000Z"
  });
  return startResponsibility({
    need: assigned.need,
    responsibility: assigned.responsibility,
    acceptedAt: "2026-09-28T15:00:30.000Z"
  });
}

test("P4: current best does not switch", () => {
  const current = initialActive();
  const decision = evaluateSwitch({
    need: current.need,
    responsibility: current.responsibility,
    candidates: [
      {
        id: "a",
        capabilities: ["implement"],
        capabilityScores: { implement: 0.92 },
        contextRefs: ["src/checkout.mjs"],
        available: true
      },
      {
        id: "b",
        capabilities: ["implement"],
        capabilityScores: { implement: 0.90 },
        contextRefs: ["src/checkout.mjs"],
        available: true
      }
    ],
    now: "2026-09-28T15:04:00.000Z",
    matcherOptions: { mode: "capability_situated" }
  });

  assert.equal(decision.shouldSwitch, false);
  assert.equal(decision.reason, "current_best");
});

test("P4: small utility improvement is suppressed by hysteresis margin", () => {
  const current = initialActive();
  const decision = evaluateSwitch({
    need: current.need,
    responsibility: current.responsibility,
    candidates: [
      {
        id: "a",
        capabilities: ["implement"],
        capabilityScores: { implement: 0.90 },
        contextRefs: ["src/checkout.mjs"],
        available: true
      },
      {
        id: "b",
        capabilities: ["implement"],
        capabilityScores: { implement: 0.95 },
        contextRefs: ["src/checkout.mjs"],
        available: true
      }
    ],
    now: "2026-09-28T15:04:00.000Z",
    matcherOptions: { mode: "capability_situated" },
    policy: {
      switchMargin: 0.10,
      minTenureMs: 0,
      cooldownMs: 0
    }
  });

  assert.equal(decision.shouldSwitch, false);
  assert.equal(decision.reason, "hysteresis_margin");
  assert.ok(decision.scoreDelta > 0);
  assert.ok(decision.scoreDelta < 0.10);
});

test("P4: meaningful utility improvement switches after guards pass", () => {
  const current = initialActive();
  const decision = evaluateSwitch({
    need: current.need,
    responsibility: current.responsibility,
    candidates: [
      {
        id: "a",
        capabilities: ["implement"],
        capabilityScores: { implement: 0.70 },
        contextRefs: [],
        available: true
      },
      {
        id: "b",
        capabilities: ["implement"],
        capabilityScores: { implement: 0.95 },
        contextRefs: ["src/checkout.mjs"],
        available: true
      }
    ],
    now: "2026-09-28T15:04:00.000Z",
    matcherOptions: { mode: "capability_situated" },
    policy: {
      switchMargin: 0.10,
      minTenureMs: 120000,
      cooldownMs: 0
    }
  });

  assert.equal(decision.shouldSwitch, true);
  assert.equal(decision.reason, "utility_improvement");
  assert.equal(decision.toAssigneeId, "b");
});

test("P4: minimum tenure blocks non-forced switch", () => {
  const current = initialActive();
  const decision = evaluateSwitch({
    need: current.need,
    responsibility: current.responsibility,
    candidates: [
      {
        id: "a",
        capabilities: ["implement"],
        capabilityScores: { implement: 0.60 },
        contextRefs: [],
        available: true
      },
      {
        id: "b",
        capabilities: ["implement"],
        capabilityScores: { implement: 0.98 },
        contextRefs: ["src/checkout.mjs"],
        available: true
      }
    ],
    now: "2026-09-28T15:01:00.000Z",
    matcherOptions: { mode: "capability_situated" },
    policy: {
      switchMargin: 0.10,
      minTenureMs: 120000,
      cooldownMs: 0
    }
  });

  assert.equal(decision.shouldSwitch, false);
  assert.equal(decision.reason, "min_tenure");
});

test("P4: cooldown blocks a non-forced switch", () => {
  const current = initialActive();
  const decision = evaluateSwitch({
    need: current.need,
    responsibility: current.responsibility,
    candidates: [
      {
        id: "a",
        capabilities: ["implement"],
        capabilityScores: { implement: 0.60 },
        contextRefs: [],
        available: true
      },
      {
        id: "b",
        capabilities: ["implement"],
        capabilityScores: { implement: 0.98 },
        contextRefs: ["src/checkout.mjs"],
        available: true
      }
    ],
    now: "2026-09-28T15:05:00.000Z",
    lastSwitchAt: "2026-09-28T15:04:00.000Z",
    matcherOptions: { mode: "capability_situated" },
    policy: {
      switchMargin: 0.10,
      minTenureMs: 0,
      cooldownMs: 180000
    }
  });

  assert.equal(decision.shouldSwitch, false);
  assert.equal(decision.reason, "cooldown");
});

test("P4: worker failure forces switch despite hysteresis guards", () => {
  const current = initialActive();
  const decision = evaluateSwitch({
    need: current.need,
    responsibility: current.responsibility,
    candidates: [
      {
        id: "a",
        capabilities: ["implement"],
        capabilityScores: { implement: 0.99 },
        contextRefs: ["src/checkout.mjs"],
        failed: true,
        available: true
      },
      {
        id: "b",
        capabilities: ["implement"],
        capabilityScores: { implement: 0.75 },
        contextRefs: [],
        available: true
      }
    ],
    now: "2026-09-28T15:00:40.000Z",
    lastSwitchAt: "2026-09-28T15:00:35.000Z",
    matcherOptions: { mode: "capability_situated" },
    policy: {
      switchMargin: 1,
      minTenureMs: 999999,
      cooldownMs: 999999
    }
  });

  assert.equal(decision.shouldSwitch, true);
  assert.equal(decision.forced, true);
  assert.equal(decision.reason, "current_failed");
  assert.equal(decision.toAssigneeId, "b");
});

test("P4: failed current worker with no alternative preserves existing Need and reports no switch", () => {
  const current = initialActive();
  const decision = evaluateSwitch({
    need: current.need,
    responsibility: current.responsibility,
    candidates: [{
      id: "a",
      capabilities: ["implement"],
      capabilityScores: { implement: 0.99 },
      contextRefs: ["src/checkout.mjs"],
      failed: true,
      available: true
    }],
    now: "2026-09-28T15:01:00.000Z",
    matcherOptions: { mode: "capability_situated" }
  });

  assert.equal(decision.shouldSwitch, false);
  assert.equal(decision.forced, true);
  assert.equal(decision.reason, "no_feasible_alternative");
  assert.equal(decision.toAssigneeId, null);
});

test("P4: executeSwitch preserves Need identity and increments assignment version", () => {
  const current = initialActive();
  const result = executeSwitch({
    need: current.need,
    responsibility: current.responsibility,
    candidates: [
      {
        id: "a",
        capabilities: ["implement"],
        capabilityScores: { implement: 0.99 },
        contextRefs: ["src/checkout.mjs"],
        failed: true,
        available: true
      },
      {
        id: "b",
        capabilities: ["implement"],
        capabilityScores: { implement: 0.8 },
        contextRefs: ["src/checkout.mjs"],
        available: true
      }
    ],
    now: "2026-09-28T15:03:00.000Z",
    matcherOptions: { mode: "capability_situated" },
    lease: {
      offeredAt: "2026-09-28T15:03:00.000Z",
      renewAfter: "2026-09-28T15:08:00.000Z",
      expiresAt: "2026-09-28T15:13:00.000Z"
    }
  });

  assert.equal(result.status, "switched");
  assert.equal(result.need.id, "need-switch");
  assert.equal(result.previousResponsibility.status, "revoked");
  assert.equal(result.responsibility.assigneeId, "b");
  assert.equal(result.responsibility.assignmentVersion, 2);
  assert.equal(result.responsibility.handoffFrom, "a");
  assert.equal(result.events.at(-1).type, "ResponsibilitySwitched");
});

test("P4: executeSwitch returns stayed when hysteresis rejects movement", () => {
  const current = initialActive();
  const result = executeSwitch({
    need: current.need,
    responsibility: current.responsibility,
    candidates: [
      {
        id: "a",
        capabilities: ["implement"],
        capabilityScores: { implement: 0.90 },
        contextRefs: ["src/checkout.mjs"],
        available: true
      },
      {
        id: "b",
        capabilities: ["implement"],
        capabilityScores: { implement: 0.95 },
        contextRefs: ["src/checkout.mjs"],
        available: true
      }
    ],
    now: "2026-09-28T15:04:00.000Z",
    matcherOptions: { mode: "capability_situated" },
    policy: {
      switchMargin: 0.10,
      minTenureMs: 0,
      cooldownMs: 0
    },
    lease: {
      offeredAt: "2026-09-28T15:04:00.000Z",
      renewAfter: "2026-09-28T15:09:00.000Z",
      expiresAt: "2026-09-28T15:14:00.000Z"
    }
  });

  assert.equal(result.status, "stayed");
  assert.equal(result.responsibility.id, current.responsibility.id);
  assert.equal(result.events[0].type, "SwitchDeferred");
});

