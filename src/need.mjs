import crypto from "node:crypto";

const NEED_STATUSES = new Set([
  "open",
  "assigned",
  "active",
  "satisfied",
  "blocked",
  "superseded",
  "cancelled"
]);

const TERMINAL_NEED_STATUSES = new Set([
  "satisfied",
  "superseded",
  "cancelled"
]);

const REDUNDANCY_POLICIES = new Set([
  "complementary",
  "independent_duplicate",
  "exclusive"
]);

const CREATED_BY = new Set([
  "deterministic_signal",
  "agent_proposal",
  "orchestrator_judgment",
  "user"
]);

const ALLOWED_TRANSITIONS = {
  open: new Set(["assigned", "active", "blocked", "satisfied", "superseded", "cancelled"]),
  assigned: new Set(["open", "active", "blocked", "satisfied", "superseded", "cancelled"]),
  active: new Set(["open", "assigned", "blocked", "satisfied", "superseded", "cancelled"]),
  blocked: new Set(["open", "assigned", "active", "satisfied", "superseded", "cancelled"]),
  satisfied: new Set(),
  superseded: new Set(),
  cancelled: new Set()
};

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function finiteUnit(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function sortedUnique(values = []) {
  return [...new Set(
    values.filter((value) => nonEmptyString(value)).map((value) => value.trim())
  )].sort((a, b) => a.localeCompare(b));
}

function normalizeRequirements(requirements = {}) {
  return {
    capabilities: sortedUnique(requirements.capabilities),
    toolAccess: sortedUnique(requirements.toolAccess),
    permissions: sortedUnique(requirements.permissions),
    workspaceAccess: sortedUnique(requirements.workspaceAccess),
    contextRefs: sortedUnique(requirements.contextRefs)
  };
}

function normalizeCoverage(coverage = {}) {
  return {
    targetRefs: sortedUnique(coverage.targetRefs),
    hypothesisRefs: sortedUnique(coverage.hypothesisRefs),
    evidenceTypes: sortedUnique(coverage.evidenceTypes),
    mutationScopes: sortedUnique(coverage.mutationScopes)
  };
}

function normalizeProposal(proposal = {}) {
  return {
    goalId: String(proposal.goalId ?? ""),
    parentNeedId: proposal.parentNeedId == null ? null : String(proposal.parentNeedId),
    objective: String(proposal.objective ?? "").trim(),
    rationale: String(proposal.rationale ?? "").trim(),
    stateVersion: String(proposal.stateVersion ?? ""),
    requirements: normalizeRequirements(proposal.requirements),
    coverage: normalizeCoverage(proposal.coverage),
    urgency: Number(proposal.urgency ?? 0),
    importance: Number(proposal.importance ?? 0),
    uncertainty: Number(proposal.uncertainty ?? 0),
    risk: Number(proposal.risk ?? 0),
    expectedInformationGain: Number(proposal.expectedInformationGain ?? 0),
    redundancyPolicy: proposal.redundancyPolicy ?? "complementary",
    dependencies: sortedUnique(proposal.dependencies),
    evidenceObligations: sortedUnique(proposal.evidenceObligations),
    exitConditions: sortedUnique(proposal.exitConditions),
    createdBy: proposal.createdBy ?? "agent_proposal",
    expiresAt: proposal.expiresAt == null ? null : String(proposal.expiresAt)
  };
}

function fingerprintPayload(proposal) {
  return {
    goalId: proposal.goalId,
    parentNeedId: proposal.parentNeedId,
    objective: proposal.objective,
    stateVersion: proposal.stateVersion,
    requirements: proposal.requirements,
    coverage: proposal.coverage,
    redundancyPolicy: proposal.redundancyPolicy,
    dependencies: proposal.dependencies,
    evidenceObligations: proposal.evidenceObligations,
    exitConditions: proposal.exitConditions
  };
}

export function validateNeedProposal(input) {
  const proposal = normalizeProposal(input);
  const errors = [];

  if (!nonEmptyString(proposal.goalId)) errors.push("goalId must be a non-empty string");
  if (!nonEmptyString(proposal.objective)) errors.push("objective must be a non-empty string");
  if (!nonEmptyString(proposal.rationale)) errors.push("rationale must be a non-empty string");
  if (!nonEmptyString(proposal.stateVersion)) errors.push("stateVersion must be a non-empty string");

  for (const key of ["urgency", "importance", "uncertainty", "risk", "expectedInformationGain"]) {
    if (!finiteUnit(proposal[key])) errors.push(`${key} must be between 0 and 1`);
  }

  if (!REDUNDANCY_POLICIES.has(proposal.redundancyPolicy)) {
    errors.push("redundancyPolicy is invalid");
  }

  if (!CREATED_BY.has(proposal.createdBy)) {
    errors.push("createdBy is invalid");
  }

  if (proposal.expiresAt != null && !Number.isFinite(Date.parse(proposal.expiresAt))) {
    errors.push("expiresAt must be a valid timestamp or null");
  }

  return {
    ok: errors.length === 0,
    errors,
    proposal
  };
}

export function needFingerprint(input) {
  const validation = validateNeedProposal(input);
  if (!validation.ok) {
    throw new TypeError(`Invalid NeedProposal: ${validation.errors.join("; ")}`);
  }

  const payload = JSON.stringify(fingerprintPayload(validation.proposal));
  return "sha256:" + crypto.createHash("sha256").update(payload).digest("hex");
}

export function admitNeedProposal(input, existingNeeds = [], options = {}) {
  const validation = validateNeedProposal(input);

  if (!validation.ok) {
    return {
      schemaVersion: 1,
      status: "rejected",
      reason: "invalid_proposal",
      errors: validation.errors,
      need: null
    };
  }

  const proposal = validation.proposal;
  const fingerprint = needFingerprint(proposal);
  const duplicate = existingNeeds.find((need) => need?.fingerprint === fingerprint);

  if (duplicate) {
    return {
      schemaVersion: 1,
      status: "duplicate",
      reason: "matching_need_exists",
      errors: [],
      need: duplicate
    };
  }

  const now = options.now == null ? null : String(options.now);
  if (now != null && !Number.isFinite(Date.parse(now))) {
    return {
      schemaVersion: 1,
      status: "rejected",
      reason: "invalid_admission_time",
      errors: ["options.now must be a valid timestamp or null"],
      need: null
    };
  }

  const need = {
    schemaVersion: 1,
    id: options.id ?? `need_${fingerprint.slice("sha256:".length, "sha256:".length + 16)}`,
    fingerprint,
    ...proposal,
    status: "open",
    createdAt: now,
    updatedAt: now,
    statusReason: null
  };

  return {
    schemaVersion: 1,
    status: "admitted",
    reason: "new_need",
    errors: [],
    need
  };
}

export function isNeedTerminal(need) {
  return TERMINAL_NEED_STATUSES.has(need?.status);
}

export function transitionNeed(need, nextStatus, options = {}) {
  if (!need || !NEED_STATUSES.has(need.status)) {
    throw new TypeError("Need has invalid current status");
  }
  if (!NEED_STATUSES.has(nextStatus)) {
    throw new TypeError("Need has invalid next status");
  }
  if (need.status === nextStatus) return { ...need };

  if (!ALLOWED_TRANSITIONS[need.status].has(nextStatus)) {
    throw new TypeError(`Invalid Need transition: ${need.status} -> ${nextStatus}`);
  }

  const now = options.now == null ? need.updatedAt ?? null : String(options.now);
  if (now != null && !Number.isFinite(Date.parse(now))) {
    throw new TypeError("Need transition time must be a valid timestamp or null");
  }

  return {
    ...need,
    status: nextStatus,
    updatedAt: now,
    statusReason: options.reason == null ? null : String(options.reason)
  };
}

export function evidenceSatisfiesNeed(need, evidenceRefs = []) {
  const required = sortedUnique(need?.evidenceObligations);
  const supplied = new Set(sortedUnique(evidenceRefs));
  return required.every((ref) => supplied.has(ref));
}

export function satisfyNeed(need, evidenceRefs = [], options = {}) {
  if (!evidenceSatisfiesNeed(need, evidenceRefs)) {
    return {
      satisfied: false,
      reason: "missing_evidence",
      need
    };
  }

  return {
    satisfied: true,
    reason: "evidence_obligations_met",
    need: transitionNeed(need, "satisfied", options)
  };
}

