import assert from "node:assert/strict";
import test from "node:test";
import { planAccessChanges } from "../src/access.mjs";

test("v1: produces sorted add/remove changes without mutating inputs", () => {
  const current = {
    bob: ["read", "write"],
    alice: ["read"]
  };
  const desired = {
    alice: ["write", "read"],
    bob: ["read"],
    carol: ["audit"]
  };

  const beforeCurrent = structuredClone(current);
  const beforeDesired = structuredClone(desired);

  assert.deepEqual(planAccessChanges(current, desired), [
    { principal: "alice", add: ["write"], remove: [] },
    { principal: "bob", add: [], remove: ["write"] },
    { principal: "carol", add: ["audit"], remove: [] }
  ]);

  assert.deepEqual(current, beforeCurrent);
  assert.deepEqual(desired, beforeDesired);
});

