import assert from "node:assert/strict";
import test from "node:test";
import { normalizePartnerRecords } from "../src/bridge.mjs";

test("v1: normalizes id/value records", () => {
  assert.deepEqual(normalizePartnerRecords([
    { id: "b", value: 2 },
    { id: "a", value: "1" }
  ]), [
    { id: "a", value: "1" },
    { id: "b", value: "2" }
  ]);
});
