function ratio(num, den) {
  return den > 0 ? num / den : null;
}

export function summarizeCoordinationField(field) {
  const coverage = Array.isArray(field?.coverage) ? field.coverage : [];
  const overlaps = Array.isArray(field?.overlaps) ? field.overlaps : [];
  const contentions = Array.isArray(field?.contentions) ? field.contentions : [];
  const evidenceGaps = Array.isArray(field?.evidenceGaps) ? field.evidenceGaps : [];
  const work = Array.isArray(field?.work) ? field.work : [];
  const agents = Array.isArray(field?.agents) ? field.agents : [];

  const coveredWorkCount = coverage.filter((item) => item.status === "covered").length;
  const degradedWorkCount = coverage.filter((item) => item.status === "degraded").length;
  const uncoveredWorkCount = coverage.filter((item) => item.status === "uncovered").length;
  const expectedWorkCount = coverage.length;

  return {
    schemaVersion: 1,
    goalId: field?.goalId ?? null,
    workflowRunId: field?.workflowRunId ?? null,
    observedAt: field?.observedAt ?? null,

    activeAgentCount: Number.isInteger(field?.resources?.activeAgentCount)
      ? field.resources.activeAgentCount
      : agents.length,

    workCount: work.length,
    expectedWorkCount,
    coveredWorkCount,
    degradedWorkCount,
    uncoveredWorkCount,
    coverageRatio: ratio(coveredWorkCount, expectedWorkCount),

    overlapPairCount: overlaps.length,
    writeWriteOverlapCount: overlaps.filter((item) => item.kind === "write_write").length,
    readWriteOverlapCount: overlaps.filter((item) => item.kind === "read_write").length,

    contentionCount: contentions.length,
    conflictContentionCount: contentions.filter((item) => item.severity === "conflict").length,

    evidenceGapCount: evidenceGaps.length,

    knownCostUsd: Number.isFinite(field?.resources?.knownCostUsd)
      ? field.resources.knownCostUsd
      : null
  };
}

export function compareCoordinationFields(before, after) {
  const left = summarizeCoordinationField(before);
  const right = summarizeCoordinationField(after);

  const delta = {};
  for (const key of [
    "activeAgentCount",
    "workCount",
    "expectedWorkCount",
    "coveredWorkCount",
    "degradedWorkCount",
    "uncoveredWorkCount",
    "overlapPairCount",
    "writeWriteOverlapCount",
    "readWriteOverlapCount",
    "contentionCount",
    "conflictContentionCount",
    "evidenceGapCount"
  ]) {
    delta[key] = right[key] - left[key];
  }

  if (left.knownCostUsd != null && right.knownCostUsd != null) {
    delta.knownCostUsd = right.knownCostUsd - left.knownCostUsd;
  } else {
    delta.knownCostUsd = null;
  }

  if (left.coverageRatio != null && right.coverageRatio != null) {
    delta.coverageRatio = right.coverageRatio - left.coverageRatio;
  } else {
    delta.coverageRatio = null;
  }

  return {
    schemaVersion: 1,
    before: left,
    after: right,
    delta
  };
}

