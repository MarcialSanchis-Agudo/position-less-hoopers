import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLocalModelLock,
  validateLocalModelLock
} from "../src/local-model-lock.mjs";

const base = buildLocalModelLock({
  model: "qwen3.5:9b",
  localProvider: "ollama",
  evalSetArg: "eval.json",
  ontologyArg: "ontology.json",
  adapterArg: "adapter.json",
  repeats: 1
});

test("local model lock accepts exact resume", () => {
  assert.equal(validateLocalModelLock({ ...base }, base), true);
});

test("local model lock rejects changing model mid-checkpoint", () => {
  assert.throws(
    () =>
      validateLocalModelLock(
        { ...base, model: "qwen3.5:4b" },
        base
      ),
    /local model lock mismatch for model/
  );
});
