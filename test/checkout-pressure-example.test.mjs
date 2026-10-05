import assert from "node:assert/strict";
import test from "node:test";
import {
  addPressure,
  applyRegionHelpSignal,
  createAdaptiveRegion,
  createPressureField,
  pressureSnapshot,
  stabilizePressureField
} from "../src/index.mjs";

test("Checkout Incident: group pressure trigger derives governed Help Need", () => {
  let region = createAdaptiveRegion({
    id: "region-checkout-pressure",
    goalId: "goal-checkout",
    stateVersion: "v1",
    exitConditions: ["evidence:checkout-integration"],
    enteredAt: "2026-09-28T17:00:00.000Z"
  });

  let pressure = createPressureField({
    nodes: [
      { id: "implementation_uncertainty", threshold: 1 },
      { id: "verification_gap", threshold: 1 }
    ],
    groups: [{
      id: "checkout_support_cluster",
      nodeIds: ["implementation_uncertainty", "verification_gap"],
      threshold: 1
    }]
  });

  pressure = addPressure(pressure, {
    nodeId: "implementation_uncertainty",
    amount: 0.55,
    reason: "undocumented_callback_contract",
    at: "2026-09-28T17:02:00.000Z"
  });
  pressure = addPressure(pressure, {
    nodeId: "verification_gap",
    amount: 0.55,
    reason: "integration_oracle_missing",
    at: "2026-09-28T17:02:05.000Z"
  });

  const before = pressureSnapshot(pressure);
  assert.deepEqual(before.unstableNodeIds, []);
  assert.deepEqual(before.unstableGroupIds, ["checkout_support_cluster"]);

  const stabilized = stabilizePressureField(pressure, {
    at: "2026-09-28T17:02:05.000Z"
  });
  assert.equal(stabilized.triggers.length, 1);
  assert.equal(stabilized.triggers[0].kind, "group");
  assert.equal(stabilized.triggers[0].id, "checkout_support_cluster");

  const help = applyRegionHelpSignal(region, {
    kind: "verification_gap",
    parentNeedId: "need-checkout",
    goalId: "goal-checkout",
    stateVersion: "v1",
    summary: "Checkout support cluster crossed coordination threshold",
    requirements: {
      capabilities: ["research"],
      contextRefs: ["spec/payments.md"]
    },
    coverage: {
      hypothesisRefs: ["payment-callback-contract"],
      evidenceTypes: ["documentation", "integration-test"]
    },
    urgency: 0.8,
    importance: 0.9,
    uncertainty: 0.9,
    expectedInformationGain: 0.9,
    evidenceObligations: ["evidence:callback-contract"]
  }, {
    id: "need-help-pressure",
    now: "2026-09-28T17:02:06.000Z"
  });

  region = help.region;

  assert.equal(help.help.admission.status, "admitted");
  assert.equal(help.help.admission.need.parentNeedId, "need-checkout");
  assert.equal(help.help.admission.need.id, "need-help-pressure");
  assert.ok(
    region.events.some((event) => event.type === "RegionHelpNeedAdmitted")
  );
});

