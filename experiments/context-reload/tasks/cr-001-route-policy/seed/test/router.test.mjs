import assert from "node:assert/strict";
import test from "node:test";
import { chooseRoute } from "../src/router.mjs";

test("exact match beats fallback", () => {
  assert.equal(chooseRoute([
    { id: "fallback", capabilities: [], fallback: true },
    { id: "exact", capabilities: ["implement"] }
  ], "implement"), "exact");
});

test("fallback is used when exact match is absent", () => {
  assert.equal(chooseRoute([
    { id: "fallback", capabilities: [], fallback: true }
  ], "verify"), "fallback");
});

test("disabled exact and fallback candidates are ignored", () => {
  assert.equal(chooseRoute([
    { id: "bad", capabilities: ["verify"], disabled: true },
    { id: "also-bad", fallback: true, disabled: true },
    { id: "good", capabilities: ["verify"] }
  ], "verify"), "good");
});

