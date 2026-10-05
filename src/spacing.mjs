function nonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function sortedUnique(values = []) {
  return [...new Set(values.filter(nonEmptyString))].sort((a, b) => a.localeCompare(b));
}

function intersection(left = [], right = []) {
  const rightSet = new Set(right);
  return sortedUnique(left.filter((value) => rightSet.has(value)));
}

function union(left = [], right = []) {
  return sortedUnique([...left, ...right]);
}

function jaccard(left = [], right = []) {
  const u = union(left, right);
  if (u.length === 0) return 0;
  return intersection(left, right).length / u.length;
}

function coverageOf(need) {
  return {
    targetRefs: sortedUnique(need?.coverage?.targetRefs),
    hypothesisRefs: sortedUnique(need?.coverage?.hypothesisRefs),
    evidenceTypes: sortedUnique(need?.coverage?.evidenceTypes),
    mutationScopes: sortedUnique(need?.coverage?.mutationScopes)
  };
}

export function semanticNeedOverlap(leftNeed, rightNeed) {
  const left = coverageOf(leftNeed);
  const right = coverageOf(rightNeed);

  const dimensions = {
    targetRefs: intersection(left.targetRefs, right.targetRefs),
    hypothesisRefs: intersection(left.hypothesisRefs, right.hypothesisRefs),
    evidenceTypes: intersection(left.evidenceTypes, right.evidenceTypes),
    mutationScopes: intersection(left.mutationScopes, right.mutationScopes)
  };

  const scores = {
    targetRefs: jaccard(left.targetRefs, right.targetRefs),
    hypothesisRefs: jaccard(left.hypothesisRefs, right.hypothesisRefs),
    evidenceTypes: jaccard(left.evidenceTypes, right.evidenceTypes),
    mutationScopes: jaccard(left.mutationScopes, right.mutationScopes)
  };

  const activeDimensions = Object.values(dimensions).filter((refs) => refs.length > 0).length;
  const meanScore = Object.values(scores).reduce((sum, value) => sum + value, 0) / 4;

  return {
    leftNeedId: leftNeed?.id ?? null,
    rightNeedId: rightNeed?.id ?? null,
    dimensions,
    scores,
    activeDimensions,
    meanScore,
    overlaps: activeDimensions > 0
  };
}

export function classifyNeedPair(leftNeed, rightNeed) {
  const overlap = semanticNeedOverlap(leftNeed, rightNeed);

  if (!overlap.overlaps) {
    return {
      ...overlap,
      classification: "disjoint",
      intentional: false
    };
  }

  const independent =
    leftNeed?.redundancyPolicy === "independent_duplicate" ||
    rightNeed?.redundancyPolicy === "independent_duplicate";

  if (independent) {
    return {
      ...overlap,
      classification: "independent_verification",
      intentional: true
    };
  }

  const mutationConflict = overlap.dimensions.mutationScopes.length > 0;
  if (mutationConflict) {
    return {
      ...overlap,
      classification: "mutation_contention_risk",
      intentional: false
    };
  }

  return {
    ...overlap,
    classification: "potential_redundancy",
    intentional: false
  };
}

export function teamSpacingReport(needs = []) {
  const activeNeeds = needs
    .filter((need) => !["satisfied", "superseded", "cancelled"].includes(need?.status))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  const pairs = [];
  for (let i = 0; i < activeNeeds.length; i += 1) {
    for (let j = i + 1; j < activeNeeds.length; j += 1) {
      pairs.push(classifyNeedPair(activeNeeds[i], activeNeeds[j]));
    }
  }

  const overlappingPairs = pairs.filter((pair) => pair.overlaps);
  const accidentalPairs = overlappingPairs.filter((pair) =>
    pair.classification === "potential_redundancy" ||
    pair.classification === "mutation_contention_risk"
  );
  const independentVerificationPairs = overlappingPairs.filter((pair) =>
    pair.classification === "independent_verification"
  );

  const targetRefs = sortedUnique(activeNeeds.flatMap((need) => need.coverage?.targetRefs ?? []));
  const hypothesisRefs = sortedUnique(activeNeeds.flatMap((need) => need.coverage?.hypothesisRefs ?? []));
  const evidenceTypes = sortedUnique(activeNeeds.flatMap((need) => need.coverage?.evidenceTypes ?? []));
  const mutationScopes = sortedUnique(activeNeeds.flatMap((need) => need.coverage?.mutationScopes ?? []));

  return {
    schemaVersion: 1,
    activeNeedCount: activeNeeds.length,
    semanticCoverage: {
      targetRefs,
      hypothesisRefs,
      evidenceTypes,
      mutationScopes
    },
    pairs,
    metrics: {
      pairCount: pairs.length,
      overlappingPairCount: overlappingPairs.length,
      accidentalOverlapPairCount: accidentalPairs.length,
      independentVerificationPairCount: independentVerificationPairs.length,
      overlapRate: pairs.length ? overlappingPairs.length / pairs.length : 0,
      accidentalOverlapRate: pairs.length ? accidentalPairs.length / pairs.length : 0
    }
  };
}

export function marginalCoverageGain(candidateNeed, existingNeeds = []) {
  const candidate = coverageOf(candidateNeed);
  const existing = {
    targetRefs: sortedUnique(existingNeeds.flatMap((need) => need.coverage?.targetRefs ?? [])),
    hypothesisRefs: sortedUnique(existingNeeds.flatMap((need) => need.coverage?.hypothesisRefs ?? [])),
    evidenceTypes: sortedUnique(existingNeeds.flatMap((need) => need.coverage?.evidenceTypes ?? [])),
    mutationScopes: sortedUnique(existingNeeds.flatMap((need) => need.coverage?.mutationScopes ?? []))
  };

  const novel = {
    targetRefs: candidate.targetRefs.filter((ref) => !existing.targetRefs.includes(ref)),
    hypothesisRefs: candidate.hypothesisRefs.filter((ref) => !existing.hypothesisRefs.includes(ref)),
    evidenceTypes: candidate.evidenceTypes.filter((ref) => !existing.evidenceTypes.includes(ref)),
    mutationScopes: candidate.mutationScopes.filter((ref) => !existing.mutationScopes.includes(ref))
  };

  const candidateSize =
    candidate.targetRefs.length +
    candidate.hypothesisRefs.length +
    candidate.evidenceTypes.length +
    candidate.mutationScopes.length;

  const novelSize =
    novel.targetRefs.length +
    novel.hypothesisRefs.length +
    novel.evidenceTypes.length +
    novel.mutationScopes.length;

  return {
    needId: candidateNeed?.id ?? null,
    novel,
    candidateCoverageItemCount: candidateSize,
    novelCoverageItemCount: novelSize,
    marginalCoverageRatio: candidateSize ? novelSize / candidateSize : 0
  };
}

