import assert from "node:assert/strict";
import test from "node:test";
import {
  createExecutionRequest,
  executionResultToCoordinationSignal,
  validateExecutionResult
} from "../src/index.mjs";

function fixture() {
  const region = {
    id: "region-1",
    goalId: "goal-1",
    stateVersion: "v1"
  };
  const need = {
    id: "need-1",
    objective: "Fix checkout callback",
    rationale: "Integration failing",
    requirements: { capabilities: ["implement"] },
    coverage: { targetRefs: ["src/checkout.mjs"] },
    evidenceObligations: ["evidence:integration"],
    exitConditions: ["evidence:integration"]
  };
  const responsibility = {
    id: "responsibility-1",
    needId: "need-1",
    assigneeId: "agent-a",
    assignmentVersion: 1,
    authority: {
      investigate: true,
      propose: true,
      execute: true,
      requestHelp: true,
      mutateScopes: ["src/checkout.mjs"]
    },
    evidenceObligations: ["evidence:integration"],
    expiresAt: "2026-09-28T20:00:00.000Z"
  };

  return { region, need, responsibility };
}

test("RunnerPort: execution request is provider-neutral and responsibility-scoped", () => {
  const request = createExecutionRequest({
    ...fixture(),
    workspace: "workspace://checkout",
    taskInstruction: "Implement the checkout callback and run the grader.",
    contextPackageRefs: ["context://payments"]
  });

  assert.equal(request.requestId, "exec:responsibility-1");
  assert.equal(request.need.id, "need-1");
  assert.equal(request.responsibility.assignmentVersion, 1);
  assert.deepEqual(request.expectedEvidenceRefs, ["evidence:integration"]);
  assert.equal(request.metadata.provider, undefined);
});

test("RunnerPort: completed result becomes evidence-bearing completion signal", () => {
  const request = createExecutionRequest({
    ...fixture(),
    workspace: "workspace://checkout",
    taskInstruction: "Implement checkout."
  });

  const result = {
    schemaVersion: 1,
    requestId: request.requestId,
    status: "completed",
    evidenceRefs: ["evidence:integration"],
    summary: "Integration tests pass"
  };

  assert.deepEqual(validateExecutionResult(result, request), {
    ok: true,
    errors: []
  });

  const signal = executionResultToCoordinationSignal(result, request);
  assert.equal(signal.type, "responsibility_completed");
  assert.deepEqual(signal.evidenceRefs, ["evidence:integration"]);
});

test("RunnerPort: blocked executor result becomes a governed Help signal", () => {
  const request = createExecutionRequest({
    ...fixture(),
    workspace: "workspace://checkout",
    taskInstruction: "Implement checkout."
  });

  const signal = executionResultToCoordinationSignal({
    schemaVersion: 1,
    requestId: request.requestId,
    status: "blocked",
    evidenceRefs: [],
    summary: "Payment callback contract is undocumented",
    blockedKind: "missing_context",
    helpRequirements: {
      capabilities: ["research"]
    }
  }, request);

  assert.equal(signal.type, "help_signal");
  assert.equal(signal.signal.parentNeedId, "need-1");
  assert.deepEqual(signal.signal.requirements.capabilities, ["research"]);
});

test("RunnerPort: mismatched result cannot be attached to another responsibility", () => {
  const request = createExecutionRequest({
    ...fixture(),
    workspace: "workspace://checkout",
    taskInstruction: "Implement checkout."
  });

  const validation = validateExecutionResult({
    schemaVersion: 1,
    requestId: "exec:other",
    status: "completed",
    evidenceRefs: []
  }, request);

  assert.equal(validation.ok, false);
  assert.ok(validation.errors.includes("requestId mismatch"));
});

