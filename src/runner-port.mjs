function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function sortedUnique(values = []) {
  return [...new Set(
    values.filter(nonEmptyString).map((value) => value.trim())
  )].sort((a, b) => a.localeCompare(b));
}

export function createExecutionRequest({
  region,
  need,
  responsibility,
  workspace,
  taskInstruction,
  contextPackageRefs = [],
  expectedEvidenceRefs = responsibility?.evidenceObligations ?? [],
  metadata = {}
}) {
  if (!region || !need || !responsibility) {
    throw new TypeError("ExecutionRequest requires region, need, and responsibility");
  }
  if (responsibility.needId !== need.id) {
    throw new TypeError("Responsibility does not belong to Need");
  }
  if (!nonEmptyString(workspace)) {
    throw new TypeError("workspace must be a non-empty string");
  }
  if (!nonEmptyString(taskInstruction)) {
    throw new TypeError("taskInstruction must be a non-empty string");
  }

  return {
    schemaVersion: 1,
    requestId: `exec:${responsibility.id}`,
    regionId: region.id,
    goalId: region.goalId,
    stateVersion: region.stateVersion,
    need: {
      id: need.id,
      objective: need.objective,
      rationale: need.rationale,
      requirements: need.requirements,
      coverage: need.coverage,
      evidenceObligations: sortedUnique(need.evidenceObligations),
      exitConditions: sortedUnique(need.exitConditions)
    },
    responsibility: {
      id: responsibility.id,
      assigneeId: responsibility.assigneeId,
      assignmentVersion: responsibility.assignmentVersion,
      authority: responsibility.authority,
      expiresAt: responsibility.expiresAt
    },
    workspace,
    taskInstruction,
    contextPackageRefs: sortedUnique(contextPackageRefs),
    expectedEvidenceRefs: sortedUnique(expectedEvidenceRefs),
    metadata: { ...metadata }
  };
}

export function validateExecutionResult(result, request) {
  const errors = [];

  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return { ok: false, errors: ["result must be an object"] };
  }

  if (result.schemaVersion !== 1) errors.push("schemaVersion must equal 1");
  if (result.requestId !== request?.requestId) errors.push("requestId mismatch");
  if (!["completed", "blocked", "failed"].includes(result.status)) {
    errors.push("status must be completed, blocked, or failed");
  }
  if (!Array.isArray(result.evidenceRefs) ||
      !result.evidenceRefs.every(nonEmptyString)) {
    errors.push("evidenceRefs must be an array of non-empty strings");
  }
  if (result.summary != null && !nonEmptyString(result.summary)) {
    errors.push("summary must be a non-empty string when present");
  }
  if (result.workspaceVersionAfter != null &&
      !nonEmptyString(result.workspaceVersionAfter)) {
    errors.push("workspaceVersionAfter must be a non-empty string when present");
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

export function executionResultToCoordinationSignal(result, request) {
  const validation = validateExecutionResult(result, request);
  if (!validation.ok) {
    throw new TypeError(
      `Invalid ExecutionResult: ${validation.errors.join("; ")}`
    );
  }

  if (result.status === "completed") {
    return {
      type: "responsibility_completed",
      responsibilityId: request.responsibility.id,
      needId: request.need.id,
      evidenceRefs: sortedUnique(result.evidenceRefs),
      summary: result.summary ?? null,
      workspaceVersionAfter: result.workspaceVersionAfter ?? null
    };
  }

  if (result.status === "blocked") {
    return {
      type: "help_signal",
      responsibilityId: request.responsibility.id,
      needId: request.need.id,
      signal: {
        kind: result.blockedKind ?? "blocked",
        parentNeedId: request.need.id,
        goalId: request.goalId,
        stateVersion: request.stateVersion,
        summary: result.summary ?? "Executor reported blocked work",
        requirements: result.helpRequirements ?? {},
        coverage: result.helpCoverage ?? {},
        evidenceObligations: result.helpEvidenceObligations ?? [],
        exitConditions: result.helpExitConditions ?? []
      }
    };
  }

  return {
    type: "responsibility_failed",
    responsibilityId: request.responsibility.id,
    needId: request.need.id,
    summary: result.summary ?? null,
    retryable: result.retryable === true
  };
}

