import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLocalModelLock,
  validateLocalModelLock,
  resolvePinnedLocalModel
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


test("pinned local model uses evaluation-set model when env is unset", () => {
  assert.equal(
    resolvePinnedLocalModel({
      expectedModel: "qwen3.5:9b",
      requestedModel: undefined
    }),
    "qwen3.5:9b"
  );
});

test("pinned local model rejects stale env from another model", () => {
  assert.throws(
    () =>
      resolvePinnedLocalModel({
        expectedModel: "qwen3.5:9b",
        requestedModel: "qwen3.5:4b"
      }),
    /PLH_LOCAL_MODEL mismatch/
  );
});
