import assert from "node:assert/strict";
import test from "node:test";
import { canAdmit } from "../src/budget.mjs";

test("reserved budget counts against admission", () => {
  assert.equal(canAdmit({ limit: 10, spent: 4, reserved: 4, requested: 3 }), false);
});

test("exact limit is allowed", () => {
  assert.equal(canAdmit({ limit: 10, spent: 4, reserved: 3, requested: 3 }), true);
});

test("negative values are rejected", () => {
  assert.equal(canAdmit({ limit: 10, spent: 0, reserved: -1, requested: 1 }), false);
});

test("zero cost is valid", () => {
  assert.equal(canAdmit({ limit: 10, spent: 10, reserved: 0, requested: 0 }), true);
});

