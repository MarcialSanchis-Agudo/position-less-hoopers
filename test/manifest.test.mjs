import assert from "node:assert/strict";
import test from "node:test";
import {
  assertExperimentRunManifest,
  validateExperimentRunManifest
} from "../src/index.mjs";

function validManifest(overrides = {}) {
  return {
    schemaVersion: 1,
    experimentId: "exp-p0-001",
    conditionId: "B1",
    taskId: "task-001",
    taskVersion: "v1",
    runKind: "clean",
    codeVersion: "local-dev",
    configHash: "sha256:test",
    modelPool: ["model-a"],
    startedAt: "2026-09-25T08:00:00.000Z",
    finishedAt: "2026-09-25T08:01:00.000Z",
    finalOutcome: "success",
    graderVersion: "grader-v1",
    costUsd: 0.5,
    concurrencyCap: 1,
    eventTraceRef: "trace.jsonl",
    artifactRefs: [],
    ...overrides
  };
}

test("manifest: valid clean run is accepted", () => {
  assert.deepEqual(validateExperimentRunManifest(validManifest()), {
    ok: true,
    errors: []
  });
});

test("manifest: perturbed run requires perturbationId", () => {
  const result = validateExperimentRunManifest(validManifest({
    runKind: "perturbed"
  }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("perturbationId is required for perturbed runs"));
});

test("manifest: excluded outcome requires exclusionReason", () => {
  const result = validateExperimentRunManifest(validManifest({
    finalOutcome: "excluded"
  }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("exclusionReason is required when finalOutcome is excluded"));
});

test("manifest: finish timestamp cannot precede start", () => {
  const result = validateExperimentRunManifest(validManifest({
    startedAt: "2026-09-25T09:00:00.000Z",
    finishedAt: "2026-09-25T08:00:00.000Z"
  }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("finishedAt must not precede startedAt"));
});

test("manifest: assertion helper throws a useful error", () => {
  assert.throws(
    () => assertExperimentRunManifest({}),
    /Invalid ExperimentRun manifest/
  );
});

