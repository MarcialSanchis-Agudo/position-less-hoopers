import assert from "node:assert/strict";
import test from "node:test";
import {
  addPressure,
  createPressureField,
  pressureSnapshot,
  stabilizePressureField
} from "../src/index.mjs";

test("pressure: below-threshold node stays stable", () => {
  let field = createPressureField({
    nodes: [{ id: "checkout", threshold: 1 }]
  });

  field = addPressure(field, {
    nodeId: "checkout",
    amount: 0.6,
    reason: "hidden_contract"
  });

  const result = stabilizePressureField(field);
  assert.equal(result.stable, true);
  assert.equal(result.triggers.length, 0);
});

test("pressure: node crossing threshold topples and emits trigger", () => {
  let field = createPressureField({
    nodes: [{ id: "checkout", threshold: 1 }]
  });

  field = addPressure(field, {
    nodeId: "checkout",
    amount: 1.2,
    reason: "worker_loss"
  });

  const result = stabilizePressureField(field);
  assert.equal(result.stable, true);
  assert.deepEqual(result.triggers.map((trigger) => trigger.id), ["checkout"]);
  assert.ok(result.field.nodes[0].pressure < 1);
});

test("pressure: node toppling propagates pressure to correlated Need", () => {
  let field = createPressureField({
    nodes: [
      { id: "checkout", threshold: 1 },
      { id: "verify", threshold: 1 }
    ],
    edges: [
      { from: "checkout", to: "verify", transfer: 0.4 }
    ]
  });

  field = addPressure(field, {
    nodeId: "checkout",
    amount: 1.1,
    reason: "integration_failure"
  });

  const result = stabilizePressureField(field);
  const verify = result.field.nodes.find((node) => node.id === "verify");

  assert.ok(verify.pressure >= 0.4);
  assert.equal(
    result.field.events.some((event) =>
      event.type === "PressureAdded" &&
      event.reason === "propagated_from:checkout"
    ),
    true
  );
});

test("pressure: group trigger fires when individuals remain below threshold", () => {
  let field = createPressureField({
    nodes: [
      { id: "implementation", threshold: 1 },
      { id: "verification", threshold: 1 }
    ],
    groups: [{
      id: "checkout-pair",
      nodeIds: ["implementation", "verification"],
      threshold: 1
    }]
  });

  field = addPressure(field, {
    nodeId: "implementation",
    amount: 0.55,
    reason: "hidden_contract"
  });
  field = addPressure(field, {
    nodeId: "verification",
    amount: 0.55,
    reason: "evidence_gap"
  });

  const before = pressureSnapshot(field);
  assert.deepEqual(before.unstableNodeIds, []);
  assert.deepEqual(before.unstableGroupIds, ["checkout-pair"]);

  const result = stabilizePressureField(field);
  assert.equal(result.triggers[0].kind, "group");
  assert.equal(result.triggers[0].id, "checkout-pair");
  assert.equal(result.stable, true);
});

test("pressure: cascades can trigger a correlated second node", () => {
  let field = createPressureField({
    nodes: [
      { id: "a", threshold: 1 },
      { id: "b", pressure: 0.7, threshold: 1 }
    ],
    edges: [{ from: "a", to: "b", transfer: 0.4 }]
  });

  field = addPressure(field, {
    nodeId: "a",
    amount: 1.0,
    reason: "event"
  });

  const result = stabilizePressureField(field);
  assert.deepEqual(
    result.triggers.map((trigger) => trigger.id),
    ["a", "b"]
  );
  assert.equal(result.stable, true);
});

