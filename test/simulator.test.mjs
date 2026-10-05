import assert from "node:assert/strict";
import test from "node:test";
import {
  comparePoliciesAcrossSeeds,
  simulateTeamEpisode
} from "../src/index.mjs";

test("P1 simulator: episodes are deterministic for the same seed and policy", () => {
  const left = simulateTeamEpisode({
    seed: 42,
    mode: "capability_situated",
    trueMissingContextPenalty: 0.3
  });
  const right = simulateTeamEpisode({
    seed: 42,
    mode: "capability_situated",
    trueMissingContextPenalty: 0.3
  });

  assert.deepEqual(left, right);
});

test("P1 simulator: high context cost rewards situated assignment", () => {
  const result = comparePoliciesAcrossSeeds({
    trueMissingContextPenalty: 0.4,
    seeds: Array.from({ length: 30 }, (_, index) => index + 1)
  });

  const capability = result.summary.find((row) => row.mode === "capability");
  const situated = result.summary.find((row) => row.mode === "capability_situated");

  assert.ok(situated.meanUtility > capability.meanUtility);
  assert.ok(situated.meanContextReloadRate < capability.meanContextReloadRate);
});

test("P1 simulator: cheap context reload can favor capability-only assignment", () => {
  const result = comparePoliciesAcrossSeeds({
    trueMissingContextPenalty: 0.03,
    seeds: Array.from({ length: 30 }, (_, index) => index + 1)
  });

  const capability = result.summary.find((row) => row.mode === "capability");
  const situated = result.summary.find((row) => row.mode === "capability_situated");

  assert.ok(capability.meanUtility > situated.meanUtility);
});

test("P1 simulator: availability perturbations remain feasible with redundant candidates", () => {
  const result = simulateTeamEpisode({
    seed: 7,
    mode: "capability_situated",
    trueMissingContextPenalty: 0.3,
    availabilityPerturbationEvery: 5
  });

  assert.ok(result.perturbationSteps > 0);
  assert.equal(result.noFeasibleCandidate, 0);
});

test("P1 simulator: static policy is separately measurable", () => {
  const result = comparePoliciesAcrossSeeds({
    trueMissingContextPenalty: 0.25,
    seeds: [1, 2, 3, 4, 5]
  });

  assert.deepEqual(
    result.summary.map((row) => row.mode),
    ["static", "capability", "capability_situated"]
  );
});

