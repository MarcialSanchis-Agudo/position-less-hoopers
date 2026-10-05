function sortedUnique(values = []) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))]
    .sort((a, b) => a.localeCompare(b));
}

function feasible(candidate, need) {
  const capabilities = new Set(candidate.capabilities ?? []);
  const tools = new Set(candidate.tools ?? []);
  const permissions = new Set(candidate.permissions ?? []);

  return (need.requiredCapabilities ?? []).every((item) => capabilities.has(item)) &&
    (need.requiredTools ?? []).every((item) => tools.has(item)) &&
    (need.requiredPermissions ?? []).every((item) => permissions.has(item)) &&
    candidate.available !== false;
}

function normalizedNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function scoreCapability(candidate, need) {
  const scores = candidate.capabilityScores ?? {};
  const required = need.requiredCapabilities ?? [];
  if (required.length === 0) return normalizedNumber(candidate.generalCapability, 0);

  const values = required.map((key) => normalizedNumber(scores[key], 0));
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function scoreSituatedness(candidate, need) {
  const needRefs = new Set(need.contextRefs ?? []);
  const contextRefs = new Set(candidate.contextRefs ?? []);
  const artifactRefs = new Set(candidate.artifactRefs ?? []);

  if (needRefs.size === 0) {
    return normalizedNumber(candidate.situatedness, 0);
  }

  let hits = 0;
  for (const ref of needRefs) {
    if (contextRefs.has(ref) || artifactRefs.has(ref)) hits += 1;
  }
  return hits / needRefs.size;
}

function scoreStatic(candidate, need) {
  const order = need.staticPreference ?? [];
  const index = order.indexOf(candidate.id);
  return index === -1 ? Number.NEGATIVE_INFINITY : order.length - index;
}

function scoreCandidate(candidate, need, mode, weights) {
  const capability = scoreCapability(candidate, need);
  const situatedness = scoreSituatedness(candidate, need);
  const expectedCost = normalizedNumber(candidate.expectedCost, 0);
  const switchCost = normalizedNumber(candidate.switchCost, 0);
  const continuity = candidate.currentNeedId === need.id ? 1 : 0;

  if (mode === "static") {
    return {
      total: scoreStatic(candidate, need),
      capability,
      situatedness,
      expectedCost,
      switchCost,
      continuity
    };
  }

  if (mode === "capability") {
    return {
      total: capability,
      capability,
      situatedness,
      expectedCost,
      switchCost,
      continuity
    };
  }

  const total =
    weights.capability * capability +
    weights.situatedness * situatedness +
    weights.continuity * continuity -
    weights.expectedCost * expectedCost -
    weights.switchCost * switchCost;

  return {
    total,
    capability,
    situatedness,
    expectedCost,
    switchCost,
    continuity
  };
}

export const DEFAULT_P1_WEIGHTS = Object.freeze({
  capability: 1,
  situatedness: 0.35,
  continuity: 0.15,
  expectedCost: 0.05,
  switchCost: 0.10
});

export function rankCandidates(candidates, need, options = {}) {
  const mode = options.mode ?? "capability_situated";
  const weights = { ...DEFAULT_P1_WEIGHTS, ...(options.weights ?? {}) };

  const ranked = candidates
    .filter((candidate) => feasible(candidate, need))
    .map((candidate) => ({
      candidateId: String(candidate.id),
      score: scoreCandidate(candidate, need, mode, weights)
    }))
    .filter((entry) => Number.isFinite(entry.score.total))
    .sort((a, b) =>
      b.score.total - a.score.total ||
      b.score.capability - a.score.capability ||
      b.score.situatedness - a.score.situatedness ||
      a.candidateId.localeCompare(b.candidateId)
    );

  return ranked;
}

export function chooseCandidate(candidates, need, options = {}) {
  const ranked = rankCandidates(candidates, need, options);
  if (ranked.length === 0) {
    return {
      candidateId: null,
      reason: "no_feasible_candidate",
      ranked: []
    };
  }

  const winner = ranked[0];

  return {
    candidateId: winner.candidateId,
    reason: options.mode ?? "capability_situated",
    score: winner.score,
    ranked
  };
}

export function assignmentDecision(input) {
  const candidateIds = sortedUnique((input.candidates ?? []).map((candidate) => String(candidate.id)));
  const choice = chooseCandidate(input.candidates ?? [], input.need ?? {}, input.options ?? {});

  return {
    schemaVersion: 1,
    needId: String(input.need?.id ?? ""),
    mode: input.options?.mode ?? "capability_situated",
    candidateIds,
    selectedCandidateId: choice.candidateId,
    selectedScore: choice.score ?? null,
    ranked: choice.ranked
  };
}

