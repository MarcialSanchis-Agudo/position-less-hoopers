import { assignNeed, activeResponsibilitiesForNeed } from "./cycle.mjs";
import {
  classifyNeedPair,
  marginalCoverageGain
} from "./spacing.mjs";
import { isNeedTerminal } from "./need.mjs";

export const DEFAULT_P3B_WEIGHTS = Object.freeze({
  urgency: 0.25,
  importance: 0.25,
  informationGain: 0.15,
  uncertainty: 0.05,
  marginalCoverage: 0.30,
  independentVerification: 0.15,
  accidentalOverlap: 0.20,
  mutationRisk: 0.35
});

function number(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function sortedUnique(values = []) {
  return [...new Set(
    values.filter((value) => typeof value === "string" && value.length > 0)
  )].sort((a, b) => a.localeCompare(b));
}

function dependencyState(need, satisfiedNeedIds = []) {
  const satisfied = new Set(satisfiedNeedIds);
  const dependencies = sortedUnique(need?.dependencies);
  const missing = dependencies.filter((id) => !satisfied.has(id));
  return {
    dependencies,
    missing,
    satisfied: missing.length === 0
  };
}

function overlapSignals(need, teamNeeds = []) {
  let accidentalOverlap = 0;
  let mutationRisk = 0;
  let independentVerification = 0;
  const pairClassifications = [];

  for (const existing of teamNeeds) {
    if (!existing || existing.id === need?.id || isNeedTerminal(existing)) continue;
    const pair = classifyNeedPair(need, existing);
    pairClassifications.push(pair);

    if (pair.classification === "independent_verification") {
      independentVerification = Math.max(
        independentVerification,
        pair.meanScore
      );
    }

    if (pair.classification === "potential_redundancy") {
      accidentalOverlap = Math.max(
        accidentalOverlap,
        pair.meanScore
      );
    }

    if (pair.classification === "mutation_contention_risk") {
      accidentalOverlap = Math.max(
        accidentalOverlap,
        pair.meanScore
      );
      mutationRisk = Math.max(
        mutationRisk,
        pair.scores.mutationScopes
      );
    }
  }

  return {
    accidentalOverlap,
    mutationRisk,
    independentVerification,
    pairClassifications
  };
}

export function needFeasibility(need, {
  existingResponsibilities = [],
  satisfiedNeedIds = [],
  maxIndependentDuplicates = 2
} = {}) {
  if (!need || typeof need !== "object") {
    return {
      feasible: false,
      reason: "invalid_need",
      dependencyState: { dependencies: [], missing: [], satisfied: false },
      liveResponsibilityCount: 0
    };
  }

  if (isNeedTerminal(need)) {
    return {
      feasible: false,
      reason: "terminal_need",
      dependencyState: dependencyState(need, satisfiedNeedIds),
      liveResponsibilityCount: 0
    };
  }

  if (!["open", "blocked", "assigned", "active"].includes(need.status)) {
    return {
      feasible: false,
      reason: "unsupported_status",
      dependencyState: dependencyState(need, satisfiedNeedIds),
      liveResponsibilityCount: 0
    };
  }

  const dependencies = dependencyState(need, satisfiedNeedIds);
  if (!dependencies.satisfied) {
    return {
      feasible: false,
      reason: "dependencies_unsatisfied",
      dependencyState: dependencies,
      liveResponsibilityCount: 0
    };
  }

  const liveResponsibilityCount = activeResponsibilitiesForNeed(
    need,
    existingResponsibilities
  ).length;

  if (
    need.redundancyPolicy !== "independent_duplicate" &&
    liveResponsibilityCount > 0
  ) {
    return {
      feasible: false,
      reason: "already_covered",
      dependencyState: dependencies,
      liveResponsibilityCount
    };
  }

  if (
    need.redundancyPolicy === "independent_duplicate" &&
    liveResponsibilityCount >= maxIndependentDuplicates
  ) {
    return {
      feasible: false,
      reason: "independent_duplicate_cap_reached",
      dependencyState: dependencies,
      liveResponsibilityCount
    };
  }

  return {
    feasible: true,
    reason: "eligible",
    dependencyState: dependencies,
    liveResponsibilityCount
  };
}

export function scoreNeedForTeam(need, {
  teamNeeds = [],
  weights = DEFAULT_P3B_WEIGHTS
} = {}) {
  const marginal = marginalCoverageGain(need, teamNeeds);
  const overlap = overlapSignals(need, teamNeeds);

  const components = {
    urgency: number(need?.urgency),
    importance: number(need?.importance),
    informationGain: number(need?.expectedInformationGain),
    uncertainty: number(need?.uncertainty),
    marginalCoverage: marginal.marginalCoverageRatio,
    independentVerification: overlap.independentVerification,
    accidentalOverlap: overlap.accidentalOverlap,
    mutationRisk: overlap.mutationRisk
  };

  const total =
    weights.urgency * components.urgency +
    weights.importance * components.importance +
    weights.informationGain * components.informationGain +
    weights.uncertainty * components.uncertainty +
    weights.marginalCoverage * components.marginalCoverage +
    weights.independentVerification * components.independentVerification -
    weights.accidentalOverlap * components.accidentalOverlap -
    weights.mutationRisk * components.mutationRisk;

  return {
    total,
    components,
    marginalCoverage: marginal,
    pairClassifications: overlap.pairClassifications
  };
}

export function rankNeedsForTeam(needs, {
  teamNeeds = [],
  existingResponsibilities = [],
  satisfiedNeedIds = [],
  maxIndependentDuplicates = 2,
  weights = DEFAULT_P3B_WEIGHTS
} = {}) {
  return (needs ?? [])
    .map((need) => {
      const feasibility = needFeasibility(need, {
        existingResponsibilities,
        satisfiedNeedIds,
        maxIndependentDuplicates
      });

      return {
        need,
        feasibility,
        score: feasibility.feasible
          ? scoreNeedForTeam(need, { teamNeeds, weights })
          : null
      };
    })
    .filter((entry) => entry.feasibility.feasible)
    .sort((a, b) =>
      b.score.total - a.score.total ||
      number(b.need.urgency) - number(a.need.urgency) ||
      number(b.need.importance) - number(a.need.importance) ||
      String(a.need.id).localeCompare(String(b.need.id))
    );
}

export function chooseNeedForTeam(needs, options = {}) {
  const ranked = rankNeedsForTeam(needs, options);

  if (ranked.length === 0) {
    return {
      schemaVersion: 1,
      selectedNeedId: null,
      selectedNeed: null,
      selectedScore: null,
      ranked: []
    };
  }

  return {
    schemaVersion: 1,
    selectedNeedId: ranked[0].need.id,
    selectedNeed: ranked[0].need,
    selectedScore: ranked[0].score,
    ranked: ranked.map((entry) => ({
      needId: entry.need.id,
      score: entry.score
    }))
  };
}

export function allocateNextResponsibility({
  needs = [],
  candidates = [],
  existingResponsibilities = [],
  satisfiedNeedIds = [],
  teamNeeds = [],
  needSelectionOptions = {},
  matcherOptions = {},
  staticPreference = [],
  assignmentVersionByNeed = {},
  authorityForNeed = () => ({}),
  leaseForNeed
}) {
  if (typeof leaseForNeed !== "function") {
    throw new TypeError("allocateNextResponsibility requires leaseForNeed(need)");
  }

  const needDecision = chooseNeedForTeam(needs, {
    teamNeeds,
    existingResponsibilities,
    satisfiedNeedIds,
    ...needSelectionOptions
  });

  if (needDecision.selectedNeed == null) {
    return {
      schemaVersion: 1,
      status: "no_eligible_need",
      needDecision,
      assignment: null
    };
  }

  const need = needDecision.selectedNeed;
  const lease = leaseForNeed(need);

  const assignment = assignNeed({
    need,
    candidates,
    existingResponsibilities,
    matcherOptions,
    staticPreference,
    assignmentVersion: assignmentVersionByNeed[need.id] ?? 1,
    authority: authorityForNeed(need),
    offeredAt: lease.offeredAt,
    renewAfter: lease.renewAfter,
    expiresAt: lease.expiresAt
  });

  return {
    schemaVersion: 1,
    status: assignment.status,
    needDecision,
    assignment
  };
}

