import { admitNeedProposal } from "./need.mjs";

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function sortedUnique(values = []) {
  return [...new Set(
    values.filter(nonEmptyString).map((value) => value.trim())
  )].sort((a, b) => a.localeCompare(b));
}

const HELP_KINDS = new Set([
  "blocked",
  "assumption_invalidated",
  "unexpected_state",
  "verification_gap",
  "missing_context"
]);

export function validateHelpSignal(signal) {
  const errors = [];

  if (!signal || typeof signal !== "object" || Array.isArray(signal)) {
    return { ok: false, errors: ["signal must be an object"] };
  }

  if (!HELP_KINDS.has(signal.kind)) {
    errors.push("kind is invalid");
  }
  if (!nonEmptyString(signal.parentNeedId)) {
    errors.push("parentNeedId must be a non-empty string");
  }
  if (!nonEmptyString(signal.goalId)) {
    errors.push("goalId must be a non-empty string");
  }
  if (!nonEmptyString(signal.stateVersion)) {
    errors.push("stateVersion must be a non-empty string");
  }
  if (!nonEmptyString(signal.summary)) {
    errors.push("summary must be a non-empty string");
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

export function helpSignalToNeedProposal(signal, options = {}) {
  const validation = validateHelpSignal(signal);
  if (!validation.ok) {
    throw new TypeError(`Invalid Help signal: ${validation.errors.join("; ")}`);
  }

  const requirements = signal.requirements ?? {};
  const coverage = signal.coverage ?? {};

  return {
    goalId: signal.goalId,
    parentNeedId: signal.parentNeedId,
    objective: options.objective ??
      `Resolve help signal for ${signal.parentNeedId}: ${signal.summary.trim()}`,
    rationale: options.rationale ??
      `Derived from ${signal.kind} signal emitted while covering parent Need ${signal.parentNeedId}`,
    stateVersion: signal.stateVersion,
    requirements: {
      capabilities: sortedUnique(requirements.capabilities),
      toolAccess: sortedUnique(requirements.toolAccess),
      permissions: sortedUnique(requirements.permissions),
      workspaceAccess: sortedUnique(requirements.workspaceAccess),
      contextRefs: sortedUnique(requirements.contextRefs)
    },
    coverage: {
      targetRefs: sortedUnique(coverage.targetRefs),
      hypothesisRefs: sortedUnique(coverage.hypothesisRefs),
      evidenceTypes: sortedUnique(coverage.evidenceTypes),
      mutationScopes: sortedUnique(coverage.mutationScopes)
    },
    urgency: Number.isFinite(signal.urgency) ? signal.urgency : 0.7,
    importance: Number.isFinite(signal.importance) ? signal.importance : 0.7,
    uncertainty: Number.isFinite(signal.uncertainty) ? signal.uncertainty : 0.8,
    risk: Number.isFinite(signal.risk) ? signal.risk : 0.3,
    expectedInformationGain: Number.isFinite(signal.expectedInformationGain)
      ? signal.expectedInformationGain
      : 0.8,
    redundancyPolicy: signal.redundancyPolicy ?? "complementary",
    dependencies: sortedUnique(signal.dependencies),
    evidenceObligations: sortedUnique(signal.evidenceObligations),
    exitConditions: sortedUnique(signal.exitConditions),
    createdBy: "agent_proposal",
    expiresAt: signal.expiresAt ?? null
  };
}

export function proposeHelpNeed(signal, existingNeeds = [], options = {}) {
  const proposal = helpSignalToNeedProposal(signal, options);

  const admitted = admitNeedProposal(proposal, existingNeeds, {
    id: options.id,
    now: options.now
  });

  return {
    schemaVersion: 1,
    signalKind: signal.kind,
    parentNeedId: signal.parentNeedId,
    proposal,
    admission: admitted
  };
}

export function childNeedsOf(parentNeedId, needs = []) {
  return needs
    .filter((need) => need?.parentNeedId === parentNeedId)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

export function helpCoverageState(parentNeed, needs = []) {
  const children = childNeedsOf(parentNeed?.id, needs);

  const active = children.filter((need) =>
    !["satisfied", "superseded", "cancelled"].includes(need.status)
  );

  const satisfied = children.filter((need) => need.status === "satisfied");

  return {
    parentNeedId: parentNeed?.id ?? null,
    childNeedCount: children.length,
    activeHelpNeedCount: active.length,
    satisfiedHelpNeedCount: satisfied.length,
    activeHelpNeedIds: active.map((need) => need.id),
    satisfiedHelpNeedIds: satisfied.map((need) => need.id)
  };
}

export function parentNeedReadyToResume(parentNeed, needs = []) {
  const state = helpCoverageState(parentNeed, needs);
  return state.childNeedCount > 0 && state.activeHelpNeedCount === 0;
}

