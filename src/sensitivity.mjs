import { contextCalibrationCell } from "./calibration.mjs";
import { DEFAULT_P1_WEIGHTS } from "./matcher.mjs";

export function runSituatednessWeightSweep({
  situatednessWeights = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5],
  capabilityGaps = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5],
  trueMissingContextPenalties = [0.1, 0.2, 0.3, 0.4],
  baseWeights = DEFAULT_P1_WEIGHTS
} = {}) {
  const rows = situatednessWeights.map((situatednessWeight) => {
    let totalRegret = 0;
    let mistakes = 0;
    let cells = 0;

    for (const trueMissingContextPenalty of trueMissingContextPenalties) {
      for (const capabilityGap of capabilityGaps) {
        const cell = contextCalibrationCell({
          capabilityGap,
          trueMissingContextPenalty,
          weights: {
            ...baseWeights,
            situatedness: situatednessWeight
          }
        });

        totalRegret += cell.regret;
        if (!cell.correct) mistakes += 1;
        cells += 1;
      }
    }

    return {
      situatednessWeight,
      cells,
      mistakes,
      accuracy: cells ? (cells - mistakes) / cells : null,
      totalRegret,
      meanRegret: cells ? totalRegret / cells : null
    };
  });

  const ranked = [...rows].sort((a, b) =>
    a.meanRegret - b.meanRegret ||
    b.accuracy - a.accuracy ||
    a.situatednessWeight - b.situatednessWeight
  );

  const bestMeanRegret = ranked[0]?.meanRegret ?? null;
  const bestWeights = bestMeanRegret == null
    ? []
    : ranked
      .filter((row) => Math.abs(row.meanRegret - bestMeanRegret) < 1e-12)
      .map((row) => row.situatednessWeight)
      .sort((a, b) => a - b);

  return {
    schemaVersion: 1,
    capabilityGaps,
    trueMissingContextPenalties,
    rows,
    bestMeanRegret,
    bestWeights
  };
}

