import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { evaluateHoopersArenaSuite } from "../src/index.mjs";

test("Hoopers Arena suite: evaluates frozen state shifts with exact B3 search", async () => {
  const base = JSON.parse(await fs.readFile(
    new URL("../examples/hoopers-arena/scenarios/last-possession.json", import.meta.url),
    "utf8"
  ));
  const suite = JSON.parse(await fs.readFile(
    new URL("../examples/hoopers-arena/state-shifts.json", import.meta.url),
    "utf8"
  ));

  const summary = evaluateHoopersArenaSuite(base, suite);

  assert.equal(summary.shiftCount, 3);
  assert.equal(summary.rows.length, 3);

  for (const row of summary.rows) {
    assert.equal(row.plhRegret, 0);
    assert.equal(row.dynamicCandidatesEvaluated, 120);
    assert.ok(row.fixedPositionRegret >= 0);
    assert.ok(row.fixedArchetypeRegret >= 0);
    assert.ok(row.dynamicPredefinedRegret >= 0);
  }
});

