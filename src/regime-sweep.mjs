import { comparePoliciesAcrossSeeds } from "./simulator.mjs";

export function runContextCostRegimeSweep({
  penalties = [0, 0.025, 0.05, 0.075, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5],
  seeds = Array.from({ length: 50 }, (_, index) => index + 1),
  ...options
} = {}) {
  const rows = penalties.map((penalty) => {
    const result = comparePoliciesAcrossSeeds({
      ...options,
      trueMissingContextPenalty: penalty,
      seeds
    });
    const byMode = new Map(result.summary.map((row) => [row.mode, row]));
    const capability = byMode.get("capability");
    const situated = byMode.get("capability_situated");
    const staticPolicy = byMode.get("static");

    return {
      trueMissingContextPenalty: penalty,
      staticMeanUtility: staticPolicy.meanUtility,
      capabilityMeanUtility: capability.meanUtility,
      situatedMeanUtility: situated.meanUtility,
      situatedMinusCapability: situated.meanUtility - capability.meanUtility,
      staticReloadRate: staticPolicy.meanContextReloadRate,
      capabilityReloadRate: capability.meanContextReloadRate,
      situatedReloadRate: situated.meanContextReloadRate
    };
  });

  let crossover = null;
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    if (previous.situatedMinusCapability <= 0 && current.situatedMinusCapability >= 0) {
      const span = current.trueMissingContextPenalty - previous.trueMissingContextPenalty;
      const deltaSpan = current.situatedMinusCapability - previous.situatedMinusCapability;
      const fraction = deltaSpan === 0 ? 0 : -previous.situatedMinusCapability / deltaSpan;
      crossover = previous.trueMissingContextPenalty + fraction * span;
      break;
    }
  }

  return {
    schemaVersion: 1,
    seeds,
    rows,
    estimatedCrossoverPenalty: crossover
  };
}

