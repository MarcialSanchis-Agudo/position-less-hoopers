import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  buildCoordinationField,
  compareCoordinationFields
} from "../src/index.mjs";

async function fixture(name) {
  return JSON.parse(await fs.readFile(new URL(`../fixtures/p0/${name}`, import.meta.url), "utf8"));
}

test("fixtures: worker-loss twin produces the expected P0 shift", async () => {
  const clean = await fixture("clean.json");
  const perturbed = await fixture("perturbed-worker-loss.json");

  const before = buildCoordinationField(clean, { observedAt: clean.observedAt });
  const after = buildCoordinationField(perturbed, { observedAt: perturbed.observedAt });

  const comparison = compareCoordinationFields(before, after);

  assert.equal(comparison.before.coveredWorkCount, 2);
  assert.equal(comparison.after.coveredWorkCount, 1);
  assert.equal(comparison.after.uncoveredWorkCount, 1);
  assert.equal(comparison.delta.uncoveredWorkCount, 1);
  assert.equal(comparison.delta.coverageRatio, -0.5);
});

