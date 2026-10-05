import { compareTriggerPolicies } from "./trigger-pilot.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function withThresholds(scenario, {
  nodeThreshold = 1,
  groupThreshold = 1
}) {
  const next = clone(scenario);
  if (next.pressureField?.nodes) {
    next.pressureField.nodes = next.pressureField.nodes.map((node) => ({
      ...node,
      threshold: node.id === "worker_loss" ? 1 : nodeThreshold
    }));
  }
  if (next.pressureField?.groups) {
    next.pressureField.groups = next.pressureField.groups.map((group) => ({
      ...group,
      threshold: groupThreshold
    }));
  }
  return next;
}

export function runTriggerThresholdSweep({
  scenarios = [],
  nodeThresholds = [0.75, 1.0, 1.25, 1.5],
  groupThresholds = [0.75, 1.0, 1.25, 1.5]
} = {}) {
  const rows = [];

  for (const nodeThreshold of nodeThresholds) {
    for (const groupThreshold of groupThresholds) {
      const runs = [];
      for (const scenario of scenarios) {
        const comparison = compareTriggerPolicies(
          withThresholds(scenario, {
            nodeThreshold,
            groupThreshold
          })
        );
        const pressure = comparison.runs.find(
          (run) => run.policy === "plh_pressure"
        );
        runs.push(pressure);
      }

      const supportLatencies = runs
        .map((run) => run.helpTriggerLatencyMs)
        .filter(Number.isFinite);

      rows.push({
        nodeThreshold,
        groupThreshold,
        scenarios: runs.length,
        coordinationRecomputations: runs.reduce(
          (sum, run) => sum + run.coordinationRecomputations, 0
        ),
        unnecessaryRecomputations: runs.reduce(
          (sum, run) => sum + run.unnecessaryRecomputations, 0
        ),
        falsePositiveHelpCount: runs.filter((run) => run.falsePositiveHelp).length,
        missedSupportCount: runs.filter((run) =>
          run.supportNeededAtMs != null &&
          run.helpTriggeredAtMs == null
        ).length,
        meanHelpTriggerLatencyMs: supportLatencies.length
          ? supportLatencies.reduce((sum, value) => sum + value, 0) /
            supportLatencies.length
          : null
      });
    }
  }

  return {
    schemaVersion: 1,
    nodeThresholds,
    groupThresholds,
    rows
  };
}

