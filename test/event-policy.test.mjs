import assert from "node:assert/strict";
import test from "node:test";
import {
  createPolicyState,
  observePolicyEvent
} from "../src/index.mjs";

const pressureField = {
  nodes: [
    { id: "uncertainty", threshold: 1 },
    { id: "verification", threshold: 1 }
  ],
  groups: [{
    id: "support",
    nodeIds: ["uncertainty", "verification"],
    threshold: 1
  }]
};

test("event policy: greedy recomputes on every observable event", () => {
  const state = createPolicyState("greedy");
  observePolicyEvent(state, {
    eventId: "noise",
    observable: true
  });
  assert.equal(state.recomputationCount, 1);
});

test("event policy: direct ignores noise but accepts semantic trigger", () => {
  const state = createPolicyState("plh_direct");
  observePolicyEvent(state, {
    eventId: "noise",
    observable: true,
    directTrigger: false
  });
  assert.equal(state.recomputationCount, 0);

  observePolicyEvent(state, {
    eventId: "blocked",
    observable: true,
    directTrigger: true
  });
  assert.equal(state.recomputationCount, 1);
});

test("event policy: pressure waits for coupled threshold", () => {
  const state = createPolicyState("plh_pressure", { pressureField });

  observePolicyEvent(state, {
    eventId: "uncertainty",
    pressureAdds: [{ nodeId: "uncertainty", amount: 0.55 }]
  });
  assert.equal(state.recomputationCount, 0);

  const second = observePolicyEvent(state, {
    eventId: "verification",
    pressureAdds: [{ nodeId: "verification", amount: 0.55 }]
  });

  assert.equal(state.recomputationCount, 1);
  assert.equal(second.decision.shouldRecompute, true);
  assert.match(second.decision.reason, /group:support/);
});

test("event policy: hybrid accepts direct trigger below pressure threshold", () => {
  const state = createPolicyState("plh_hybrid", { pressureField });

  const result = observePolicyEvent(state, {
    eventId: "blocked",
    directTrigger: true,
    pressureAdds: [
      { nodeId: "uncertainty", amount: 0.2 }
    ]
  });

  assert.equal(state.recomputationCount, 1);
  assert.equal(result.decision.shouldRecompute, true);
  assert.equal(result.decision.reason, "direct_semantic_trigger");
});

test("event policy: hybrid also accepts pressure threshold without direct trigger", () => {
  const state = createPolicyState("plh_hybrid", { pressureField });

  observePolicyEvent(state, {
    eventId: "uncertainty",
    directTrigger: false,
    pressureAdds: [{ nodeId: "uncertainty", amount: 0.55 }]
  });

  const second = observePolicyEvent(state, {
    eventId: "verification",
    directTrigger: false,
    pressureAdds: [{ nodeId: "verification", amount: 0.55 }]
  });

  assert.equal(state.recomputationCount, 1);
  assert.equal(second.decision.shouldRecompute, true);
  assert.match(second.decision.reason, /group:support/);
});

test("event policy: guarded hybrid preserves hybrid trigger semantics", () => {
  const state = createPolicyState("plh_hybrid_guarded", { pressureField });

  const direct = observePolicyEvent(state, {
    eventId: "blocked",
    directTrigger: true,
    pressureAdds: []
  });

  assert.equal(direct.decision.shouldRecompute, true);
  assert.equal(direct.decision.reason, "direct_semantic_trigger");
  assert.equal(state.recomputationCount, 1);
});

test("event policy: static never recomputes", () => {
  const state = createPolicyState("static");
  observePolicyEvent(state, {
    eventId: "contract-change",
    observable: true,
    directTrigger: true
  });
  assert.equal(state.recomputationCount, 0);
});

