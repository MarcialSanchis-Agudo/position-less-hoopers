import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  createCoordinationTarget,
  deriveBasketballNeeds,
  dynamicPredefinedRoleBaseline,
  fixedArchetypeBaseline,
  runLastPossessionMechanismTest,
  solveBasketballCoordinationTarget,
  validateCoordinationTarget
} from "../src/index.mjs";

async function scenario() {
  return JSON.parse(await fs.readFile(
    new URL(
      "../examples/hoopers-arena/scenarios/last-possession.json",
      import.meta.url
    ),
    "utf8"
  ));
}

test("CoordinationTarget: version-bound structured target validates", () => {
  const target = createCoordinationTarget({
    id: "target-1",
    goalId: "goal-1",
    stateVersion: "v7",
    requiredCoverage: [
      {
        needId: "verify",
        critical: true,
        objective: "Independent verification"
      }
    ],
    assignment: { verify: "agent-b" },
    exitConditions: ["evidence:verified"],
    score: 1.2
  });

  assert.deepEqual(validateCoordinationTarget(target), {
    ok: true,
    errors: []
  });
  assert.equal(target.stateVersion, "v7");
  assert.deepEqual(target.assignment, { verify: "agent-b" });
});

test("Hoopers Arena: authoritative state change creates five different Needs", async () => {
  const s = await scenario();

  assert.deepEqual(
    deriveBasketballNeeds(s.initialState).map((need) => need.id),
    [
      "primary_creation",
      "ball_screen",
      "strong_side_spacing",
      "weak_side_spacing",
      "rim_pressure"
    ]
  );

  assert.deepEqual(
    deriveBasketballNeeds(s.trapState).map((need) => need.id),
    [
      "ball_security",
      "release_outlet",
      "short_roll_connector",
      "weak_side_lift",
      "rim_window"
    ]
  );
});

test("Hoopers Arena: exhaustive 5v5 solver evaluates all 5! assignments", async () => {
  const s = await scenario();
  const target = solveBasketballCoordinationTarget({
    agents: s.agents,
    state: s.trapState
  });

  assert.equal(target.candidatesEvaluated, 120);
  assert.equal(Object.keys(target.assignment).length, 5);
  assert.equal(target.requiredCoverage.length, 5);
});

test("Hoopers Arena: PLH target is exact assignment oracle by construction", async () => {
  const result = runLastPossessionMechanismTest(await scenario());

  assert.equal(result.trap.plh.oracleRegret, 0);
  assert.ok(result.trap.fixedPosition.oracleRegret >= 0);
  assert.ok(result.trap.fixedArchetype.oracleRegret >= 0);
  assert.ok(result.trap.dynamicPredefinedRoles.oracleRegret >= 0);
});

test("Hoopers Arena: strong role baselines search the same 120 assignments", async () => {
  const s = await scenario();
  const fixedArchetype = fixedArchetypeBaseline({
    agents: s.agents,
    state: s.trapState
  });
  const dynamicRoles = dynamicPredefinedRoleBaseline({
    agents: s.agents,
    state: s.trapState
  });

  assert.equal(fixedArchetype.candidatesEvaluated, 120);
  assert.equal(dynamicRoles.candidatesEvaluated, 120);
});

test("Hoopers Arena: trap produces positionless function reassignment", async () => {
  const result = runLastPossessionMechanismTest(await scenario());

  assert.notDeepEqual(
    result.initialTarget.assignment,
    result.trap.plh.assignment
  );

  const initialFunctions = new Set(
    Object.keys(result.initialTarget.assignment)
  );
  const trapFunctions = new Set(
    Object.keys(result.trap.plh.assignment)
  );

  assert.equal(
    [...initialFunctions].some((name) => trapFunctions.has(name)),
    false
  );
});

