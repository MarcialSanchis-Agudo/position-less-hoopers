import assert from "node:assert/strict";
import test from "node:test";
import {
  admitNeedProposal,
  evidenceSatisfiesNeed,
  needFingerprint,
  satisfyNeed,
  transitionNeed,
  validateNeedProposal
} from "../src/index.mjs";

function proposal(overrides = {}) {
  return {
    goalId: "g1",
    objective: "Verify auth contract",
    rationale: "Integration state requires verification",
    stateVersion: "v1",
    requirements: {
      capabilities: ["verify"],
      contextRefs: ["spec/auth.md"]
    },
    coverage: {
      targetRefs: ["src/auth.mjs"],
      evidenceTypes: ["test"]
    },
    urgency: 0.7,
    importance: 0.9,
    uncertainty: 0.3,
    risk: 0.2,
    expectedInformationGain: 0.5,
    redundancyPolicy: "complementary",
    dependencies: [],
    evidenceObligations: ["test:auth"],
    exitConditions: ["auth-tests-pass"],
    createdBy: "agent_proposal",
    ...overrides
  };
}

test("P2 Need: valid proposals normalize and validate", () => {
  const result = validateNeedProposal(proposal({
    requirements: {
      capabilities: ["verify", "verify"],
      contextRefs: ["b", "a", "a"]
    }
  }));

  assert.equal(result.ok, true);
  assert.deepEqual(result.proposal.requirements.capabilities, ["verify"]);
  assert.deepEqual(result.proposal.requirements.contextRefs, ["a", "b"]);
});

test("P2 Need: fingerprint is deterministic across ordering", () => {
  const left = proposal({
    requirements: {
      capabilities: ["verify", "research"],
      contextRefs: ["b", "a"]
    }
  });
  const right = proposal({
    requirements: {
      capabilities: ["research", "verify"],
      contextRefs: ["a", "b"]
    }
  });

  assert.equal(needFingerprint(left), needFingerprint(right));
});

test("P2 Need: state version participates in identity", () => {
  assert.notEqual(
    needFingerprint(proposal({ stateVersion: "v1" })),
    needFingerprint(proposal({ stateVersion: "v2" }))
  );
});

test("P2 Need: admission produces deterministic id and deduplicates", () => {
  const admitted = admitNeedProposal(proposal(), [], {
    now: "2026-09-28T10:00:00.000Z"
  });

  assert.equal(admitted.status, "admitted");
  assert.match(admitted.need.id, /^need_[a-f0-9]{16}$/);
  assert.equal(admitted.need.status, "open");

  const duplicate = admitNeedProposal(proposal(), [admitted.need], {
    now: "2026-09-28T10:01:00.000Z"
  });
  assert.equal(duplicate.status, "duplicate");
  assert.equal(duplicate.need.id, admitted.need.id);
});

test("P2 Need: invalid proposal is rejected rather than admitted", () => {
  const result = admitNeedProposal(proposal({ objective: "", risk: 3 }));
  assert.equal(result.status, "rejected");
  assert.equal(result.reason, "invalid_proposal");
  assert.ok(result.errors.length >= 2);
});

test("P2 Need: lifecycle is explicit and terminal states do not reopen", () => {
  const admitted = admitNeedProposal(proposal()).need;
  const assigned = transitionNeed(admitted, "assigned", {
    now: "2026-09-28T10:00:00.000Z"
  });
  const active = transitionNeed(assigned, "active", {
    now: "2026-09-28T10:01:00.000Z"
  });
  const satisfied = transitionNeed(active, "satisfied", {
    now: "2026-09-28T10:02:00.000Z"
  });

  assert.equal(satisfied.status, "satisfied");
  assert.throws(
    () => transitionNeed(satisfied, "open"),
    /Invalid Need transition/
  );
});

test("P2 Need: evidence obligations gate satisfaction", () => {
  const need = admitNeedProposal(proposal()).need;

  assert.equal(evidenceSatisfiesNeed(need, []), false);
  assert.equal(evidenceSatisfiesNeed(need, ["test:auth"]), true);

  const missing = satisfyNeed(need, []);
  assert.equal(missing.satisfied, false);
  assert.equal(missing.need.status, "open");

  const complete = satisfyNeed(need, ["test:auth"], {
    now: "2026-09-28T10:03:00.000Z"
  });
  assert.equal(complete.satisfied, true);
  assert.equal(complete.need.status, "satisfied");
});

