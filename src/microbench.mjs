import { chooseCandidate } from "./matcher.mjs";

export function realizedOutcome(candidate, scenario) {
  const truth = scenario.truth ?? {};
  const required = scenario.need?.requiredCapabilities ?? [];
  const scores = candidate.capabilityScores ?? {};

  const capability = required.length
    ? required.reduce((sum, key) => sum + (Number.isFinite(scores[key]) ? scores[key] : 0), 0) / required.length
    : (Number.isFinite(candidate.generalCapability) ? candidate.generalCapability : 0);

  const localityPenalty = (scenario.need?.contextRefs ?? []).filter((ref) =>
    !(candidate.contextRefs ?? []).includes(ref) &&
    !(candidate.artifactRefs ?? []).includes(ref)
  ).length * (truth.missingContextPenalty ?? 0);

  const switchPenalty = candidate.currentNeedId === scenario.need?.id
    ? 0
    : (truth.switchPenalty ?? 0);

  const costPenalty = (Number.isFinite(candidate.expectedCost) ? candidate.expectedCost : 0) *
    (truth.costPenalty ?? 0);

  return {
    realizedUtility:
      capability * (truth.capabilityWeight ?? 1) -
      localityPenalty -
      switchPenalty -
      costPenalty,
    capability,
    localityPenalty,
    switchPenalty,
    costPenalty
  };
}

export function runMicrobenchmarkScenario(scenario, modes = ["static", "capability", "capability_situated"]) {
  const byId = new Map((scenario.candidates ?? []).map((candidate) => [String(candidate.id), candidate]));
  const results = [];

  for (const mode of modes) {
    const choice = chooseCandidate(scenario.candidates ?? [], scenario.need ?? {}, {
      mode,
      weights: scenario.matcherWeights
    });

    const candidate = choice.candidateId == null ? null : byId.get(choice.candidateId);
    const outcome = candidate ? realizedOutcome(candidate, scenario) : null;

    results.push({
      mode,
      candidateId: choice.candidateId,
      predictedScore: choice.score?.total ?? null,
      realizedUtility: outcome?.realizedUtility ?? Number.NEGATIVE_INFINITY,
      realized: outcome
    });
  }

  return {
    scenarioId: scenario.id,
    results
  };
}

export function summarizeMicrobenchmark(runs) {
  const byMode = new Map();

  for (const run of runs) {
    const best = Math.max(...run.results.map((result) => result.realizedUtility));

    for (const result of run.results) {
      const current = byMode.get(result.mode) ?? {
        mode: result.mode,
        scenarios: 0,
        wins: 0,
        totalUtility: 0,
        totalRegret: 0
      };

      current.scenarios += 1;
      current.totalUtility += result.realizedUtility;
      current.totalRegret += best - result.realizedUtility;
      if (result.realizedUtility === best) current.wins += 1;

      byMode.set(result.mode, current);
    }
  }

  return [...byMode.values()]
    .map((entry) => ({
      ...entry,
      meanUtility: entry.totalUtility / entry.scenarios,
      meanRegret: entry.totalRegret / entry.scenarios
    }))
    .sort((a, b) => a.mode.localeCompare(b.mode));
}

