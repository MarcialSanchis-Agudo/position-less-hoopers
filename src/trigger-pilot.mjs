import {
  addPressure,
  createPressureField,
  stabilizePressureField
} from "./pressure.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function firstAtOrAfter(events, kind, atMs) {
  return events.find((event) => event.action === kind && event.tMs >= atMs) ?? null;
}

function policyShouldDirectTrigger(event) {
  return event.directTrigger === true;
}

function truthAt(timeline, index) {
  let supportNeededSinceMs = null;
  let workerLossSinceMs = null;

  for (let i = 0; i <= index; i += 1) {
    const event = timeline[i];
    if (event.truth?.supportNeeded === true && supportNeededSinceMs == null) {
      supportNeededSinceMs = event.tMs;
    }
    if (event.truth?.workerLost === true && workerLossSinceMs == null) {
      workerLossSinceMs = event.tMs;
    }
  }

  return {
    supportNeededSinceMs,
    workerLossSinceMs
  };
}

function runTriggeredAction({
  event,
  truth,
  state,
  recomputationReason
}) {
  const actions = [];

  if (
    truth.supportNeededSinceMs != null &&
    state.helpTriggeredAtMs == null
  ) {
    state.helpTriggeredAtMs = event.tMs;
    actions.push("help");
  }

  if (
    truth.workerLossSinceMs != null &&
    state.switchTriggeredAtMs == null
  ) {
    state.switchTriggeredAtMs = event.tMs;
    actions.push("switch");
  }

  state.recomputations.push({
    eventId: event.eventId,
    tMs: event.tMs,
    reason: recomputationReason,
    actions
  });

  return actions;
}

export function simulateTriggerPolicy(scenario, policyName) {
  const timeline = scenario.timeline ?? [];
  const state = {
    helpTriggeredAtMs: null,
    switchTriggeredAtMs: null,
    recomputations: []
  };

  let pressureField = policyName === "plh_pressure"
    ? createPressureField(clone(scenario.pressureField ?? {}))
    : null;

  for (let index = 0; index < timeline.length; index += 1) {
    const event = timeline[index];
    const truth = truthAt(timeline, index);

    if (policyName === "react_every_event") {
      if (event.observable !== false) {
        runTriggeredAction({
          event,
          truth,
          state,
          recomputationReason: "observable_event"
        });
      }
      continue;
    }

    if (policyName === "plh_direct") {
      if (policyShouldDirectTrigger(event)) {
        runTriggeredAction({
          event,
          truth,
          state,
          recomputationReason: "direct_semantic_trigger"
        });
      }
      continue;
    }

    if (policyName === "plh_pressure") {
      for (const increment of event.pressureAdds ?? []) {
        pressureField = addPressure(pressureField, {
          nodeId: increment.nodeId,
          amount: increment.amount,
          reason: event.eventId,
          at: event.tMs
        });
      }

      const stabilized = stabilizePressureField(pressureField, {
        at: event.tMs
      });
      pressureField = stabilized.field;

      if (stabilized.triggers.length > 0) {
        runTriggeredAction({
          event,
          truth,
          state,
          recomputationReason: stabilized.triggers
            .map((trigger) => `${trigger.kind}:${trigger.id}`)
            .join(",")
        });
      }
      continue;
    }

    throw new TypeError(`Unknown trigger policy: ${policyName}`);
  }

  const supportTruth = timeline.find((event) => event.truth?.supportNeeded === true)?.tMs ?? null;
  const workerTruth = timeline.find((event) => event.truth?.workerLost === true)?.tMs ?? null;

  const usefulRecomputations = state.recomputations.filter((item) => item.actions.length > 0).length;
  const coordinationRecomputations = state.recomputations.length;

  return {
    schemaVersion: 1,
    scenarioId: scenario.scenarioId,
    policy: policyName,
    coordinationRecomputations,
    usefulRecomputations,
    unnecessaryRecomputations: coordinationRecomputations - usefulRecomputations,
    triggerPrecision: coordinationRecomputations
      ? usefulRecomputations / coordinationRecomputations
      : null,
    supportNeededAtMs: supportTruth,
    helpTriggeredAtMs: state.helpTriggeredAtMs,
    helpTriggerLatencyMs:
      supportTruth != null && state.helpTriggeredAtMs != null
        ? state.helpTriggeredAtMs - supportTruth
        : null,
    switchTriggeredAtMs: state.switchTriggeredAtMs,
    switchTriggerLatencyMs:
      workerTruth != null && state.switchTriggeredAtMs != null
        ? state.switchTriggeredAtMs - workerTruth
        : workerTruth == null
          ? null
          : null,
    falsePositiveHelp:
      supportTruth == null && state.helpTriggeredAtMs != null,
    falsePositiveSwitch:
      workerTruth == null && state.switchTriggeredAtMs != null,
    recomputations: state.recomputations
  };
}

export function compareTriggerPolicies(scenario) {
  const policies = scenario.policies ?? [
    "react_every_event",
    "plh_direct",
    "plh_pressure"
  ];

  return {
    schemaVersion: 1,
    scenarioId: scenario.scenarioId,
    runs: policies.map((policy) =>
      simulateTriggerPolicy(scenario, policy)
    )
  };
}

export function summarizeTriggerScenarios(comparisons) {
  const byPolicy = new Map();

  for (const comparison of comparisons) {
    for (const run of comparison.runs) {
      const row = byPolicy.get(run.policy) ?? {
        policy: run.policy,
        scenarios: 0,
        coordinationRecomputations: 0,
        unnecessaryRecomputations: 0,
        usefulRecomputations: 0,
        falsePositiveHelpCount: 0,
        supportLatencySamples: []
      };

      row.scenarios += 1;
      row.coordinationRecomputations += run.coordinationRecomputations;
      row.unnecessaryRecomputations += run.unnecessaryRecomputations;
      row.usefulRecomputations += run.usefulRecomputations;
      if (run.falsePositiveHelp) row.falsePositiveHelpCount += 1;
      if (Number.isFinite(run.helpTriggerLatencyMs)) {
        row.supportLatencySamples.push(run.helpTriggerLatencyMs);
      }

      byPolicy.set(run.policy, row);
    }
  }

  return [...byPolicy.values()]
    .map((row) => ({
      policy: row.policy,
      scenarios: row.scenarios,
      coordinationRecomputations: row.coordinationRecomputations,
      unnecessaryRecomputations: row.unnecessaryRecomputations,
      usefulRecomputations: row.usefulRecomputations,
      falsePositiveHelpCount: row.falsePositiveHelpCount,
      meanHelpTriggerLatencyMs: row.supportLatencySamples.length
        ? row.supportLatencySamples.reduce((sum, value) => sum + value, 0) /
          row.supportLatencySamples.length
        : null
    }))
    .sort((a, b) => a.policy.localeCompare(b.policy));
}

