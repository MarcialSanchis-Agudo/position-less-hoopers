import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { runTriggerThresholdSweep } from "../src/index.mjs";

async function scenario(name) {
  return JSON.parse(await fs.readFile(
    new URL(`../benchmarks/courtshift/scenarios/${name}`, import.meta.url),
    "utf8"
  ));
}

test("trigger sensitivity: sweep evaluates all threshold combinations", async () => {
  const result = runTriggerThresholdSweep({
    scenarios: [
      await scenario("trigger-coupled-signals.json"),
      await scenario("trigger-noise-only.json"),
      await scenario("trigger-slow-drift.json")
    ],
    nodeThresholds: [0.75, 1],
    groupThresholds: [0.75, 1]
  });

  assert.equal(result.rows.length, 4);
});

test("trigger sensitivity: lower thresholds increase or preserve recomputation pressure", async () => {
  const result = runTriggerThresholdSweep({
    scenarios: [
      await scenario("trigger-coupled-signals.json"),
      await scenario("trigger-noise-only.json"),
      await scenario("trigger-slow-drift.json")
    ],
    nodeThresholds: [0.75, 1.5],
    groupThresholds: [1]
  });

  const low = result.rows.find((row) => row.nodeThreshold === 0.75);
  const high = result.rows.find((row) => row.nodeThreshold === 1.5);

  assert.ok(low.coordinationRecomputations >= high.coordinationRecomputations);
});

test("trigger sensitivity: higher group threshold can delay coupled support trigger", async () => {
  const result = runTriggerThresholdSweep({
    scenarios: [
      await scenario("trigger-coupled-signals.json")
    ],
    nodeThresholds: [1.5],
    groupThresholds: [1, 1.5]
  });

  const low = result.rows.find((row) => row.groupThreshold === 1);
  const high = result.rows.find((row) => row.groupThreshold === 1.5);

  assert.ok(
    high.meanHelpTriggerLatencyMs == null ||
    high.meanHelpTriggerLatencyMs >= low.meanHelpTriggerLatencyMs
  );
});

