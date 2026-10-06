import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  deriveBasketballNeeds,
  evaluateHoopersArenaSuite
} from "../src/index.mjs";

async function baseScenario() {
  return JSON.parse(await fs.readFile(
    new URL(
      "../examples/hoopers-arena/scenarios/last-possession.json",
      import.meta.url
    ),
    "utf8"
  ));
}

async function expandedSuite() {
  return JSON.parse(await fs.readFile(
    new URL(
      "../examples/hoopers-arena/state-shifts-expanded-v2.json",
      import.meta.url
    ),
    "utf8"
  ));
}

test("Hoopers Arena expanded catalog: each new defensive mode derives five state-specific Needs", async () => {
  const suite = await expandedSuite();
  const expected = {
    zone_23: [
      "top_reversal",
      "high_post_flash",
      "short_corner_occupancy",
      "zone_skip_window",
      "zone_glass_balance"
    ],
    drop_coverage: [
      "pocket_pullup",
      "screen_reangle",
      "rim_dive",
      "slot_lift",
      "tag_punish"
    ],
    scramble_rotation: [
      "advance_outlet",
      "middle_fill",
      "corner_sprint",
      "rim_run",
      "safety_balance"
    ]
  };

  for (const shift of suite.shifts) {
    if (!expected[shift.id]) continue;
    assert.deepEqual(
      deriveBasketballNeeds(shift.state).map((need) => need.id),
      expected[shift.id]
    );
  }
});

test("Hoopers Arena expanded catalog: six state shifts retain exact 5! comparison", async () => {
  const summary = evaluateHoopersArenaSuite(
    await baseScenario(),
    await expandedSuite()
  );

  assert.equal(summary.shiftCount, 6);
  assert.equal(summary.rows.length, 6);

  for (const row of summary.rows) {
    assert.equal(row.plhRegret, 0);
    assert.equal(row.dynamicCandidatesEvaluated, 120);
    assert.ok(row.fixedPositionRegret >= 0);
    assert.ok(row.fixedArchetypeRegret >= 0);
    assert.ok(row.dynamicPredefinedRegret >= 0);
  }
});

