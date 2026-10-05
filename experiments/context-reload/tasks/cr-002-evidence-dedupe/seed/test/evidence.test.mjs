import assert from "node:assert/strict";
import test from "node:test";
import { normalizeEvidence } from "../src/evidence.mjs";

test("deduplicates while preserving first-seen order", () => {
  assert.deepEqual(normalizeEvidence([
    { ref: "b", confidence: 0.5 },
    { ref: "a", confidence: 0.7 },
    { ref: "b", confidence: 0.6 }
  ]), [
    { ref: "b", confidence: 0.6 },
    { ref: "a", confidence: 0.7 }
  ]);
});

test("weaker duplicate does not downgrade evidence", () => {
  assert.deepEqual(normalizeEvidence([
    { ref: "x", confidence: 0.9 },
    { ref: "x", confidence: 0.3 }
  ]), [{ ref: "x", confidence: 0.9 }]);
});

