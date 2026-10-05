import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  compareSwitchingPolicies,
  simulateSwitchingPolicy
} from "../src/index.mjs";

async function scenario() {
  return JSON.parse(await fs.readFile(
    new URL("../benchmarks/courtshift/scenarios/switching-pilot.json", import.meta.url),
    "utf8"
  ));
}

test("switching pilot: no-switch fails to recover from worker loss", async () => {
  const result = simulateSwitchingPolicy(await scenario(), "no_switch");
  assert.equal(result.switchCount, 0);
  assert.equal(result.finalOperational, false);
  assert.ok(result.uncoveredAfterWorkerLossMs > 0);
});

test("switching pilot: greedy recovers but churns on small oscillations", async () => {
  const result = simulateSwitchingPolicy(await scenario(), "greedy_switch");
  assert.equal(result.finalOperational, true);
  assert.ok(result.switchCount >= 2);
  assert.ok(result.unnecessarySwitchCount >= 1);
});

test("switching pilot: PLH hysteresis suppresses churn and still recovers", async () => {
  const result = simulateSwitchingPolicy(await scenario(), "plh_hysteresis", {
    switchPolicy: {
      switchMargin: 0.10,
      minTenureMs: 120000,
      cooldownMs: 180000
    }
  });

  assert.equal(result.finalOperational, true);
  assert.equal(result.unnecessarySwitchCount, 0);
  assert.equal(result.switchCount, 1);
  assert.equal(result.uncoveredAfterWorkerLossMs, 0);
  assert.equal(
    result.events.filter((event) =>
      event.type === "Stayed" && (event.tMs === 180000 || event.tMs === 240000)
    ).length,
    2
  );
  assert.equal(
    result.events.some((event) => event.forced === true),
    true
  );
});

test("switching pilot: comparison runs all declared policies on same scenario", async () => {
  const result = compareSwitchingPolicies(await scenario(), {
    switchPolicy: {
      switchMargin: 0.10,
      minTenureMs: 120000,
      cooldownMs: 180000
    }
  });

  assert.deepEqual(
    result.runs.map((run) => run.policy),
    ["no_switch", "greedy_switch", "plh_hysteresis"]
  );
});

