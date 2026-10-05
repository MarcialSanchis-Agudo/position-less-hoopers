import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  compareTriggerPolicies,
  simulateTriggerPolicy,
  summarizeTriggerScenarios
} from "../src/index.mjs";

async function load(name) {
  return JSON.parse(await fs.readFile(
    new URL(`../benchmarks/courtshift/scenarios/${name}`, import.meta.url),
    "utf8"
  ));
}

test("trigger pilot: coupled signals let pressure match reactive timing with fewer recomputations", async () => {
  const scenario = await load("trigger-coupled-signals.json");
  const reactive = simulateTriggerPolicy(scenario, "react_every_event");
  const direct = simulateTriggerPolicy(scenario, "plh_direct");
  const pressure = simulateTriggerPolicy(scenario, "plh_pressure");

  assert.equal(reactive.helpTriggerLatencyMs, 0);
  assert.equal(pressure.helpTriggerLatencyMs, 0);
  assert.equal(direct.helpTriggerLatencyMs, 60000);

  assert.ok(reactive.coordinationRecomputations > pressure.coordinationRecomputations);
  assert.equal(pressure.unnecessaryRecomputations, 0);
  assert.equal(pressure.switchTriggerLatencyMs, 0);
});

test("trigger pilot: noise-only trace causes reactive recomputation but no pressure trigger", async () => {
  const scenario = await load("trigger-noise-only.json");
  const reactive = simulateTriggerPolicy(scenario, "react_every_event");
  const direct = simulateTriggerPolicy(scenario, "plh_direct");
  const pressure = simulateTriggerPolicy(scenario, "plh_pressure");

  assert.equal(reactive.coordinationRecomputations, 3);
  assert.equal(reactive.unnecessaryRecomputations, 3);
  assert.equal(direct.coordinationRecomputations, 0);
  assert.equal(pressure.coordinationRecomputations, 0);
});

test("trigger pilot: slow drift exposes a pressure false-positive failure mode", async () => {
  const scenario = await load("trigger-slow-drift.json");
  const pressure = simulateTriggerPolicy(scenario, "plh_pressure");

  assert.equal(pressure.coordinationRecomputations, 1);
  assert.equal(pressure.unnecessaryRecomputations, 1);
  assert.equal(pressure.falsePositiveHelp, false);
  assert.equal(pressure.usefulRecomputations, 0);
});

test("trigger pilot: comparison preserves declared policy ordering", async () => {
  const comparison = compareTriggerPolicies(
    await load("trigger-coupled-signals.json")
  );

  assert.deepEqual(
    comparison.runs.map((run) => run.policy),
    ["react_every_event", "plh_direct", "plh_pressure"]
  );
});

test("trigger pilot: aggregate summary makes tradeoffs explicit", async () => {
  const comparisons = await Promise.all([
    "trigger-coupled-signals.json",
    "trigger-noise-only.json",
    "trigger-slow-drift.json"
  ].map(async (name) => compareTriggerPolicies(await load(name))));

  const summary = summarizeTriggerScenarios(comparisons);
  const reactive = summary.find((row) => row.policy === "react_every_event");
  const pressure = summary.find((row) => row.policy === "plh_pressure");

  assert.ok(reactive.coordinationRecomputations > pressure.coordinationRecomputations);
  assert.ok(reactive.unnecessaryRecomputations > pressure.unnecessaryRecomputations);
  assert.equal(pressure.scenarios, 3);
});

