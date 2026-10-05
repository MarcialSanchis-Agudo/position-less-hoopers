function sortedUnique(values = []) {
  return [...new Set(
    values.filter((value) => typeof value === "string" && value.length > 0)
  )].sort((a, b) => a.localeCompare(b));
}

export function createCoordinationTarget({
  id,
  goalId,
  stateVersion,
  requiredCoverage = [],
  assignment = {},
  constraints = {},
  evidenceObligations = [],
  exitConditions = [],
  score = null,
  generatedBy = "deterministic_plh"
}) {
  if (!id || !goalId || !stateVersion) {
    throw new TypeError(
      "CoordinationTarget requires id, goalId, and stateVersion"
    );
  }

  return {
    schemaVersion: 1,
    id,
    goalId,
    stateVersion,
    generatedBy,
    requiredCoverage: requiredCoverage
      .map((item) => ({
        needId: item.needId,
        critical: item.critical === true,
        objective: item.objective ?? null
      }))
      .sort((a, b) => String(a.needId).localeCompare(String(b.needId))),
    assignment: Object.fromEntries(
      Object.entries(assignment)
        .sort(([a], [b]) => a.localeCompare(b))
    ),
    constraints: {
      maxUncoveredCriticalNeeds:
        constraints.maxUncoveredCriticalNeeds ?? 0,
      maxMutationContention:
        constraints.maxMutationContention ?? 0,
      maxConcurrentResponsibilities:
        constraints.maxConcurrentResponsibilities ?? null,
      budgetEnvelope:
        constraints.budgetEnvelope ?? null
    },
    evidenceObligations: sortedUnique(evidenceObligations),
    exitConditions: sortedUnique(exitConditions),
    score
  };
}

export function validateCoordinationTarget(target) {
  const errors = [];

  if (!target || typeof target !== "object" || Array.isArray(target)) {
    return { ok: false, errors: ["target must be an object"] };
  }

  if (target.schemaVersion !== 1) {
    errors.push("schemaVersion must equal 1");
  }

  for (const key of ["id", "goalId", "stateVersion"]) {
    if (typeof target[key] !== "string" || target[key].length === 0) {
      errors.push(`${key} must be a non-empty string`);
    }
  }

  if (!Array.isArray(target.requiredCoverage)) {
    errors.push("requiredCoverage must be an array");
  }

  if (
    target.assignment == null ||
    typeof target.assignment !== "object" ||
    Array.isArray(target.assignment)
  ) {
    errors.push("assignment must be an object");
  }

  return { ok: errors.length === 0, errors };
}

