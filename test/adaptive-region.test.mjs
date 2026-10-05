import assert from "node:assert/strict";
import test from "node:test";
import {
  adaptiveRegionSnapshot,
  admitRegionNeed,
  allocateRegionNext,
  applyRegionHelpSignal,
  createAdaptiveRegion,
  finishRegionResponsibility,
  regionCanExit,
  startRegionResponsibility,
  switchRegionResponsibility,
  transitionNeed,
  tryExitAdaptiveRegion
} from "../src/index.mjs";

function checkoutNeedProposal() {
  return {
    goalId: "goal-checkout",
    objective: "Implement and verify checkout payment callback",
    rationale: "Checkout workflow requires the integration to pass its external grader",
    stateVersion: "v1",
    requirements: {
      capabilities: ["implement"],
      contextRefs: ["src/checkout.mjs"]
    },
    coverage: {
      targetRefs: ["src/checkout.mjs"],
      mutationScopes: ["src/checkout.mjs"],
      evidenceTypes: ["integration-test"]
    },
    urgency: 0.8,
    importance: 1,
    uncertainty: 0.3,
    risk: 0.4,
    expectedInformationGain: 0.3,
    redundancyPolicy: "exclusive",
    evidenceObligations: ["evidence:checkout-integration"],
    exitConditions: ["evidence:checkout-integration"],
    createdBy: "deterministic_signal"
  };
}

function candidatesAAndB() {
  return [
    {
      id: "agent-a",
      capabilities: ["implement"],
      capabilityScores: { implement: 0.90 },
      contextRefs: ["src/checkout.mjs"],
      available: true
    },
    {
      id: "agent-b",
      capabilities: ["implement", "research"],
      capabilityScores: { implement: 0.86, research: 0.92 },
      contextRefs: ["src/checkout.mjs", "spec/payments.md"],
      available: true
    }
  ];
}

function lease(atMinute) {
  const base = Date.parse("2026-09-28T16:00:00.000Z");
  const offeredAt = new Date(base + atMinute * 60000).toISOString();
  return {
    offeredAt,
    renewAfter: new Date(Date.parse(offeredAt) + 300000).toISOString(),
    expiresAt: new Date(Date.parse(offeredAt) + 600000).toISOString()
  };
}

test("P5a: region cannot exit before evidence and Need completion", () => {
  const region = createAdaptiveRegion({
    id: "region-checkout",
    goalId: "goal-checkout",
    stateVersion: "v1",
    exitConditions: ["evidence:checkout-integration"],
    enteredAt: "2026-09-28T16:00:00.000Z"
  });

  const check = regionCanExit(region);
  assert.equal(check.canExit, false);
  assert.deepEqual(check.missingExitConditions, ["evidence:checkout-integration"]);
});

test("P5a: Checkout Incident vertical slice completes through help and forced switch", () => {
  let region = createAdaptiveRegion({
    id: "region-checkout",
    goalId: "goal-checkout",
    stateVersion: "v1",
    exitConditions: ["evidence:checkout-integration"],
    enteredAt: "2026-09-28T16:00:00.000Z"
  });

  // 1. Admit the primary implementation Need.
  const admitted = admitRegionNeed(region, checkoutNeedProposal(), {
    id: "need-checkout",
    now: "2026-09-28T16:00:10.000Z"
  });
  region = admitted.region;
  assert.equal(admitted.admission.status, "admitted");

  // 2. Allocate and start it. A wins initially.
  const allocation = allocateRegionNext(region, {
    candidates: candidatesAAndB(),
    matcherOptions: { mode: "capability_situated" },
    authorityForNeed: () => ({
      investigate: true,
      propose: true,
      execute: true,
      requestHelp: true,
      mutateScopes: ["src/checkout.mjs"]
    }),
    leaseForNeed: () => lease(1)
  });
  region = allocation.region;
  assert.equal(allocation.allocation.assignment.responsibility.assigneeId, "agent-a");

  const primaryResponsibilityId = allocation.allocation.assignment.responsibility.id;
  const started = startRegionResponsibility(region, {
    responsibilityId: primaryResponsibilityId,
    acceptedAt: "2026-09-28T16:01:30.000Z"
  });
  region = started.region;

  // 3. A hits an undocumented callback contract and asks for help.
  const help = applyRegionHelpSignal(region, {
    kind: "blocked",
    parentNeedId: "need-checkout",
    goalId: "goal-checkout",
    stateVersion: "v1",
    summary: "Undocumented payment callback contract",
    requirements: {
      capabilities: ["research"],
      contextRefs: ["spec/payments.md"]
    },
    coverage: {
      hypothesisRefs: ["payment-callback-contract"],
      evidenceTypes: ["documentation"]
    },
    urgency: 0.9,
    importance: 0.9,
    uncertainty: 0.9,
    expectedInformationGain: 0.9,
    evidenceObligations: ["evidence:callback-contract"],
    exitConditions: ["evidence:callback-contract"]
  }, {
    id: "need-help-callback",
    now: "2026-09-28T16:02:00.000Z"
  });
  region = help.region;
  assert.equal(help.help.admission.status, "admitted");

  // Block parent while support Need is active.
  const parent = region.needs.find((need) => need.id === "need-checkout");
  region.needs = region.needs.map((need) =>
    need.id === parent.id
      ? transitionNeed(need, "blocked", {
          now: "2026-09-28T16:02:00.000Z",
          reason: "awaiting_help"
        })
      : need
  );

  // 4. Allocate help Need; B has research capability/context.
  const helpAllocation = allocateRegionNext(region, {
    candidates: candidatesAAndB(),
    matcherOptions: { mode: "capability_situated" },
    authorityForNeed: () => ({
      investigate: true,
      propose: true,
      execute: false,
      requestHelp: false,
      mutateScopes: []
    }),
    leaseForNeed: () => lease(3)
  });
  region = helpAllocation.region;
  assert.equal(helpAllocation.allocation.needDecision.selectedNeedId, "need-help-callback");
  assert.equal(helpAllocation.allocation.assignment.responsibility.assigneeId, "agent-b");

  const helpResponsibilityId = helpAllocation.allocation.assignment.responsibility.id;
  region = startRegionResponsibility(region, {
    responsibilityId: helpResponsibilityId,
    acceptedAt: "2026-09-28T16:03:30.000Z"
  }).region;

  // 5. B grounds the callback contract.
  const helpFinished = finishRegionResponsibility(region, {
    responsibilityId: helpResponsibilityId,
    completedAt: "2026-09-28T16:05:00.000Z",
    evidenceRefs: ["evidence:callback-contract"]
  });
  region = helpFinished.region;
  assert.equal(helpFinished.finished.status, "need_satisfied");

  // Parent becomes active again after help is resolved.
  region.needs = region.needs.map((need) =>
    need.id === "need-checkout"
      ? transitionNeed(need, "active", {
          now: "2026-09-28T16:05:10.000Z",
          reason: "help_resolved"
        })
      : need
  );

  // 6. Worker loss: A disappears. P4 forces switch to B.
  const switched = switchRegionResponsibility(region, {
    responsibilityId: primaryResponsibilityId,
    candidates: [
      {
        id: "agent-a",
        capabilities: ["implement"],
        capabilityScores: { implement: 0.95 },
        contextRefs: ["src/checkout.mjs"],
        available: false
      },
      {
        id: "agent-b",
        capabilities: ["implement"],
        capabilityScores: { implement: 0.86 },
        contextRefs: ["src/checkout.mjs", "spec/payments.md"],
        available: true
      }
    ],
    now: "2026-09-28T16:06:00.000Z",
    matcherOptions: { mode: "capability_situated" },
    lease: lease(6)
  });
  region = switched.region;
  assert.equal(switched.switched.status, "switched");
  assert.equal(switched.switched.responsibility.assigneeId, "agent-b");
  assert.equal(switched.switched.need.id, "need-checkout");

  // 7. Activate replacement responsibility.
  const replacementId = switched.switched.responsibility.id;
  region = startRegionResponsibility(region, {
    responsibilityId: replacementId,
    acceptedAt: "2026-09-28T16:06:10.000Z"
  }).region;

  // 8. B completes implementation with final integration evidence.
  const final = finishRegionResponsibility(region, {
    responsibilityId: replacementId,
    completedAt: "2026-09-28T16:09:00.000Z",
    evidenceRefs: ["evidence:checkout-integration"]
  });
  region = final.region;
  assert.equal(final.finished.status, "need_satisfied");

  // 9. Exit adaptive region.
  const exit = tryExitAdaptiveRegion(region, {
    at: "2026-09-28T16:09:05.000Z"
  });
  assert.equal(exit.exited, true);
  region = exit.region;

  const snapshot = adaptiveRegionSnapshot(region);
  assert.equal(snapshot.status, "completed");
  assert.deepEqual(snapshot.activeNeedIds, []);
  assert.deepEqual(snapshot.exit.missingExitConditions, []);
  assert.equal(snapshot.exit.canExit, true);

  const eventTypes = region.events.map((event) => event.type);
  assert.ok(eventTypes.includes("RegionHelpNeedAdmitted"));
  assert.ok(eventTypes.includes("ResponsibilitySwitched"));
  assert.ok(eventTypes.includes("NeedSatisfied"));
  assert.ok(eventTypes.includes("AdaptiveRegionExited"));
});

test("P5a: region refuses exit while a child Help Need remains unresolved", () => {
  let region = createAdaptiveRegion({
    id: "region-help-open",
    goalId: "goal-checkout",
    stateVersion: "v1",
    exitConditions: [],
    enteredAt: "2026-09-28T16:00:00.000Z"
  });

  region = admitRegionNeed(region, checkoutNeedProposal(), {
    id: "need-checkout"
  }).region;

  region = applyRegionHelpSignal(region, {
    kind: "verification_gap",
    parentNeedId: "need-checkout",
    goalId: "goal-checkout",
    stateVersion: "v1",
    summary: "Need independent integration evidence"
  }, {
    id: "need-help-verify"
  }).region;

  const exit = tryExitAdaptiveRegion(region, {
    at: "2026-09-28T16:05:00.000Z"
  });

  assert.equal(exit.exited, false);
  assert.ok(exit.check.unresolvedNeedIds.includes("need-help-verify"));
});

