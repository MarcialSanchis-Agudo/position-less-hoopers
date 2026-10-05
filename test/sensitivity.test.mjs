import assert from "node:assert/strict";
import test from "node:test";
import {
  runSituatednessWeightSweep
} from "../src/index.mjs";

test("P1 sensitivity: a fixed true context penalty is minimized by the matching weight", () => {
  const result = runSituatednessWeightSweep({
    situatednessWeights: [0, 0.1, 0.2, 0.3, 0.4],
    trueMissingContextPenalties: [0.2]
  });

  assert.deepEqual(result.bestWeights, [0.2]);
  assert.equal(result.bestMeanRegret, 0);
});

test("P1 sensitivity: mixed 0.1-0.4 context penalties favor middle weights", () => {
  const result = runSituatednessWeightSweep();

  assert.deepEqual(result.bestWeights, [0.25, 0.3]);

  const frozen = result.rows.find((row) => row.situatednessWeight === 0.35);
  const best = result.rows.find((row) => row.situatednessWeight === 0.25);

  assert.ok(frozen.meanRegret > best.meanRegret);
  assert.ok(frozen.meanRegret < 0.02);
});

test("P1 sensitivity: zero locality weight is poor when context loss is genuinely costly", () => {
  const result = runSituatednessWeightSweep({
    trueMissingContextPenalties: [0.3, 0.4]
  });

  const zero = result.rows.find((row) => row.situatednessWeight === 0);
  const middle = result.rows.find((row) => row.situatednessWeight === 0.35);

  assert.ok(zero.meanRegret > middle.meanRegret);
  assert.ok(zero.mistakes > middle.mistakes);
});

test("P1 sensitivity: very high locality weight becomes costly when context penalties are small", () => {
  const result = runSituatednessWeightSweep({
    trueMissingContextPenalties: [0.05, 0.1]
  });

  const high = result.rows.find((row) => row.situatednessWeight === 0.5);
  const low = result.rows.find((row) => row.situatednessWeight === 0.1);

  assert.ok(high.meanRegret > low.meanRegret);
});

