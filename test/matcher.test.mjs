import assert from "node:assert/strict";
import test from "node:test";
import {
  assignmentDecision,
  chooseCandidate,
  rankCandidates
} from "../src/index.mjs";

test("P1: hard capability constraints exclude infeasible candidates", () => {
  const choice = chooseCandidate([
    { id: "a", capabilities: ["research"], capabilityScores: { research: 1 } },
    { id: "b", capabilities: ["implement"], capabilityScores: { implement: 0.5 } }
  ], {
    id: "n1",
    requiredCapabilities: ["implement"]
  }, { mode: "capability" });

  assert.equal(choice.candidateId, "b");
});

test("P1: capability-only selects the strongest feasible candidate", () => {
  const choice = chooseCandidate([
    { id: "a", capabilities: ["implement"], capabilityScores: { implement: 0.9 } },
    { id: "b", capabilities: ["implement"], capabilityScores: { implement: 0.8 } }
  ], {
    id: "n1",
    requiredCapabilities: ["implement"],
    contextRefs: ["x"]
  }, { mode: "capability" });

  assert.equal(choice.candidateId, "a");
});

test("P1: situatedness can outweigh a small capability advantage", () => {
  const choice = chooseCandidate([
    {
      id: "a",
      capabilities: ["implement"],
      capabilityScores: { implement: 0.95 },
      contextRefs: []
    },
    {
      id: "b",
      capabilities: ["implement"],
      capabilityScores: { implement: 0.86 },
      contextRefs: ["src/payments.ts"]
    }
  ], {
    id: "n1",
    requiredCapabilities: ["implement"],
    contextRefs: ["src/payments.ts"]
  }, { mode: "capability_situated" });

  assert.equal(choice.candidateId, "b");
});

test("P1: a large capability advantage can still dominate locality", () => {
  const choice = chooseCandidate([
    {
      id: "a",
      capabilities: ["verify"],
      capabilityScores: { verify: 0.98 },
      contextRefs: []
    },
    {
      id: "b",
      capabilities: ["verify"],
      capabilityScores: { verify: 0.50 },
      contextRefs: ["spec/auth.md"]
    }
  ], {
    id: "n1",
    requiredCapabilities: ["verify"],
    contextRefs: ["spec/auth.md"]
  }, { mode: "capability_situated" });

  assert.equal(choice.candidateId, "a");
});

test("P1: continuity rewards staying on the same Need", () => {
  const choice = chooseCandidate([
    {
      id: "a",
      capabilities: ["debug"],
      capabilityScores: { debug: 0.90 },
      contextRefs: ["x"],
      currentNeedId: "n1"
    },
    {
      id: "b",
      capabilities: ["debug"],
      capabilityScores: { debug: 0.94 },
      contextRefs: ["x"]
    }
  ], {
    id: "n1",
    requiredCapabilities: ["debug"],
    contextRefs: ["x"]
  }, { mode: "capability_situated" });

  assert.equal(choice.candidateId, "a");
});

test("P1: static mode honors declared preference among feasible candidates", () => {
  const choice = chooseCandidate([
    { id: "a", capabilities: ["implement"] },
    { id: "b", capabilities: ["implement"] }
  ], {
    id: "n1",
    requiredCapabilities: ["implement"],
    staticPreference: ["b", "a"]
  }, { mode: "static" });

  assert.equal(choice.candidateId, "b");
});

test("P1: deterministic tie-breaking uses candidate ID", () => {
  const ranked = rankCandidates([
    { id: "b", capabilities: ["implement"], capabilityScores: { implement: 0.8 } },
    { id: "a", capabilities: ["implement"], capabilityScores: { implement: 0.8 } }
  ], {
    id: "n1",
    requiredCapabilities: ["implement"]
  }, { mode: "capability" });

  assert.deepEqual(ranked.map((item) => item.candidateId), ["a", "b"]);
});

test("P1: assignmentDecision is machine-readable and stable", () => {
  const decision = assignmentDecision({
    need: {
      id: "n1",
      requiredCapabilities: ["implement"]
    },
    candidates: [
      { id: "b", capabilities: ["implement"], capabilityScores: { implement: 0.7 } },
      { id: "a", capabilities: ["implement"], capabilityScores: { implement: 0.8 } }
    ],
    options: { mode: "capability" }
  });

  assert.equal(decision.schemaVersion, 1);
  assert.deepEqual(decision.candidateIds, ["a", "b"]);
  assert.equal(decision.selectedCandidateId, "a");
});

