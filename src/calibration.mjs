import { chooseCandidate, DEFAULT_P1_WEIGHTS } from "./matcher.mjs";

export function capabilityThresholdForLocality({
  situatednessDelta = 1,
  continuityDelta = 0,
  expectedCostDelta = 0,
  switchCostDelta = 0,
  weights = DEFAULT_P1_WEIGHTS
} = {}) {
  return (
    weights.situatedness * situatednessDelta +
    weights.continuity * continuityDelta -
    weights.expectedCost * expectedCostDelta -
    weights.switchCost * switchCostDelta
  ) / weights.capability;
}

export function contextCalibrationCell({
  capabilityGap,
  trueMissingContextPenalty,
  weights = DEFAULT_P1_WEIGHTS
}) {
  const need = {
    id: "calibration-need",
    requiredCapabilities: ["work"],
    contextRefs: ["context://target"]
  };

  const candidates = [
    {
      id: "high-capability",
      capabilities: ["work"],
      capabilityScores: { work: 1 },
      contextRefs: [],
      available: true
    },
    {
      id: "situated",
      capabilities: ["work"],
      capabilityScores: { work: 1 - capabilityGap },
      contextRefs: ["context://target"],
      available: true
    }
  ];

  const choice = chooseCandidate(candidates, need, {
    mode: "capability_situated",
    weights
  });

  const trueUtility = {
    "high-capability": 1 - trueMissingContextPenalty,
    situated: 1 - capabilityGap
  };

  const optimalCandidateId =
    trueUtility.situated > trueUtility["high-capability"]
      ? "situated"
      : "high-capability";

  const selectedUtility = choice.candidateId == null
    ? Number.NEGATIVE_INFINITY
    : trueUtility[choice.candidateId];

  const optimalUtility = Math.max(...Object.values(trueUtility));

  return {
    capabilityGap,
    trueMissingContextPenalty,
    selectedCandidateId: choice.candidateId,
    optimalCandidateId,
    selectedUtility,
    optimalUtility,
    regret: optimalUtility - selectedUtility,
    correct: choice.candidateId === optimalCandidateId
  };
}

export function runContextCalibrationGrid({
  capabilityGaps = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5],
  trueMissingContextPenalties = [0, 0.1, 0.2, 0.3, 0.4, 0.5],
  weights = DEFAULT_P1_WEIGHTS
} = {}) {
  const cells = [];

  for (const trueMissingContextPenalty of trueMissingContextPenalties) {
    for (const capabilityGap of capabilityGaps) {
      cells.push(contextCalibrationCell({
        capabilityGap,
        trueMissingContextPenalty,
        weights
      }));
    }
  }

  const byPenalty = trueMissingContextPenalties.map((penalty) => {
    const subset = cells.filter((cell) => cell.trueMissingContextPenalty === penalty);
    const mistakes = subset.filter((cell) => !cell.correct).length;
    const totalRegret = subset.reduce((sum, cell) => sum + cell.regret, 0);

    return {
      trueMissingContextPenalty: penalty,
      cells: subset.length,
      mistakes,
      accuracy: subset.length ? (subset.length - mistakes) / subset.length : null,
      totalRegret,
      meanRegret: subset.length ? totalRegret / subset.length : null
    };
  });

  const mistakes = cells.filter((cell) => !cell.correct).length;
  const totalRegret = cells.reduce((sum, cell) => sum + cell.regret, 0);

  return {
    schemaVersion: 1,
    matcherSituatednessWeight: weights.situatedness,
    decisionThreshold: capabilityThresholdForLocality({ weights }),
    cells,
    byPenalty,
    summary: {
      cells: cells.length,
      mistakes,
      accuracy: cells.length ? (cells.length - mistakes) / cells.length : null,
      totalRegret,
      meanRegret: cells.length ? totalRegret / cells.length : null
    }
  };
}

