import assert from "node:assert/strict";
import test from "node:test";
import { planRollout } from "../src/rollout.mjs";

test("v1: filters unhealthy nodes and respects max batch size", () => {
  assert.deepEqual(
    planRollout([
      { id: "a", zone: "z1", healthy: true },
      { id: "b", zone: "z2", healthy: false },
      { id: "c", zone: "z1", healthy: true },
      { id: "d", zone: "z3", healthy: true }
    ], { maxBatchSize: 2 }),
    [["a", "c"], ["d"]]
  );
});

