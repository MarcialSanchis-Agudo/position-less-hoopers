import assert from "node:assert/strict";
import test from "node:test";
import { overlapPairs } from "../src/overlap.mjs";

test("emits one deterministic record per undirected pair", () => {
  assert.deepEqual(overlapPairs([
    { id: "b", status: "active", writeSet: ["shared", "b"] },
    { id: "a", status: "active", writeSet: ["a", "shared"] }
  ]), [
    { left: "a", right: "b", refs: ["shared"] }
  ]);
});

test("inactive work does not participate", () => {
  assert.deepEqual(overlapPairs([
    { id: "a", status: "active", writeSet: ["shared"] },
    { id: "b", status: "done", writeSet: ["shared"] }
  ]), []);
});

test("disjoint work emits nothing", () => {
  assert.deepEqual(overlapPairs([
    { id: "a", status: "active", writeSet: ["a"] },
    { id: "b", status: "active", writeSet: ["b"] }
  ]), []);
});

