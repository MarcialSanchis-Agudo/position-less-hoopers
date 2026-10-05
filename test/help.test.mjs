import assert from "node:assert/strict";
import test from "node:test";
import {
  admitNeedProposal,
  childNeedsOf,
  helpCoverageState,
  helpSignalToNeedProposal,
  parentNeedReadyToResume,
  proposeHelpNeed,
  transitionNeed,
  validateHelpSignal
} from "../src/index.mjs";

function parentNeed() {
  return admitNeedProposal({
    goalId: "g-help",
    objective: "Implement checkout integration",
    rationale: "Primary implementation Need",
    stateVersion: "v1",
    requirements: { capabilities: ["implement"] },
    coverage: { targetRefs: ["src/checkout.mjs"] },
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
    id: "need-parent",
    now: "2026-09-28T14:20:00.000Z"
  }).need;
}

function signal(overrides = {}) {
  return {
    kind: "blocked",
    parentNeedId: "need-parent",
    goalId: "g-help",
    stateVersion: "v1",
    summary: "Undocumented payment callback contract",
    requirements: {
      capabilities: ["research"],
      contextRefs: ["src/checkout.mjs", "spec/payments.md"]
    },
    coverage: {
      targetRefs: ["spec/payments.md"],
      hypothesisRefs: ["payment-callback-contract"],
      evidenceTypes: ["documentation"]
    },
    urgency: 0.8,
    importance: 0.8,
    uncertainty: 0.9,
    expectedInformationGain: 0.9,
    evidenceObligations: ["evidence:callback-contract"],
    exitConditions: ["callback-contract-grounded"],
    ...overrides
  };
}

test("P3c help: valid signal is accepted as a proposal source", () => {
  assert.deepEqual(validateHelpSignal(signal()), {
    ok: true,
    errors: []
  });
});

test("P3c help: signal derives a child Need proposal rather than a helper role", () => {
  const proposal = helpSignalToNeedProposal(signal());

  assert.equal(proposal.parentNeedId, "need-parent");
  assert.equal(proposal.createdBy, "agent_proposal");
  assert.deepEqual(proposal.requirements.capabilities, ["research"]);
  assert.deepEqual(proposal.coverage.hypothesisRefs, ["payment-callback-contract"]);
  assert.match(proposal.objective, /Resolve help signal/);
});

test("P3c help: help proposal goes through normal deterministic Need admission", () => {
  const result = proposeHelpNeed(signal(), [parentNeed()], {
    id: "need-help-1",
    now: "2026-09-28T14:21:00.000Z"
  });

  assert.equal(result.admission.status, "admitted");
  assert.equal(result.admission.need.id, "need-help-1");
  assert.equal(result.admission.need.parentNeedId, "need-parent");
  assert.equal(result.admission.need.status, "open");
});

test("P3c help: duplicate blocked signal does not create duplicate authoritative Need", () => {
  const first = proposeHelpNeed(signal(), [parentNeed()], {
    id: "need-help-1",
    now: "2026-09-28T14:21:00.000Z"
  }).admission.need;

  const second = proposeHelpNeed(signal(), [parentNeed(), first], {
    id: "need-help-2",
    now: "2026-09-28T14:22:00.000Z"
  });

  assert.equal(second.admission.status, "duplicate");
  assert.equal(second.admission.need.id, "need-help-1");
});

test("P3c help: changed state version creates a new help Need identity", () => {
  const first = proposeHelpNeed(signal(), [parentNeed()], {
    id: "need-help-v1",
    now: "2026-09-28T14:21:00.000Z"
  }).admission.need;

  const second = proposeHelpNeed(signal({ stateVersion: "v2" }), [parentNeed(), first], {
    id: "need-help-v2",
    now: "2026-09-28T14:22:00.000Z"
  });

  assert.equal(second.admission.status, "admitted");
  assert.equal(second.admission.need.id, "need-help-v2");
});

test("P3c help: child Need discovery is deterministic", () => {
  const first = proposeHelpNeed(signal({ summary: "A" }), [parentNeed()], {
    id: "help-b"
  }).admission.need;
  const second = proposeHelpNeed(signal({
    summary: "B",
    coverage: { targetRefs: ["other"] }
  }), [parentNeed(), first], {
    id: "help-a"
  }).admission.need;

  assert.deepEqual(
    childNeedsOf("need-parent", [first, second]).map((need) => need.id),
    ["help-a", "help-b"]
  );
});

test("P3c help: parent is not ready while a help Need remains active", () => {
  const parent = parentNeed();
  const help = proposeHelpNeed(signal(), [parent], {
    id: "help-1"
  }).admission.need;

  const state = helpCoverageState(parent, [parent, help]);
  assert.equal(state.activeHelpNeedCount, 1);
  assert.equal(parentNeedReadyToResume(parent, [parent, help]), false);
});

test("P3c help: parent becomes resumable when all help Needs are terminal", () => {
  const parent = parentNeed();
  const help = proposeHelpNeed(signal(), [parent], {
    id: "help-1"
  }).admission.need;
  const done = transitionNeed(help, "satisfied", {
    now: "2026-09-28T14:30:00.000Z"
  });

  const state = helpCoverageState(parent, [parent, done]);
  assert.equal(state.satisfiedHelpNeedCount, 1);
  assert.equal(state.activeHelpNeedCount, 0);
  assert.equal(parentNeedReadyToResume(parent, [parent, done]), true);
});

test("P3c help: parent with no help history is not spuriously marked resumable", () => {
  const parent = parentNeed();
  assert.equal(parentNeedReadyToResume(parent, [parent]), false);
});

