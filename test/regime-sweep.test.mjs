import assert from "node:assert/strict";
import test from "node:test";
import { runContextCostRegimeSweep } from "../src/index.mjs";

test("P1 regime sweep: situated assignment crosses capability-only as context cost rises", () => {
  const result = runContextCostRegimeSweep({
    penalties: [0, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5],
    seeds: Array.from({ length: 20 }, (_, index) => index + 1)
  });

  const first = result.rows[0];
  const last = result.rows.at(-1);

  assert.ok(first.situatedMinusCapability < 0);
  assert.ok(last.situatedMinusCapability > 0);
  assert.ok(result.estimatedCrossoverPenalty > 0);
  assert.ok(result.estimatedCrossoverPenalty < 0.5);
});

test("P1 regime sweep: situated assignment consistently reduces reload rate", () => {
  const result = runContextCostRegimeSweep({
    penalties: [0, 0.2, 0.4],
    seeds: [1, 2, 3, 4, 5]
  });

  for (const row of result.rows) {
    assert.ok(row.situatedReloadRate < row.capabilityReloadRate);
  }
});

