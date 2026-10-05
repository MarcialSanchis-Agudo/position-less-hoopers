import {
  addPressure,
  createPressureField,
  stabilizePressureField
} from "./pressure.mjs";

export function createPolicyState(policy, {
  pressureField = null
} = {}) {
  return {
    policy,
    pressureField:
      [
        "plh_pressure",
        "plh_hybrid",
        "plh_hybrid_guarded"
      ].includes(policy)
        ? createPressureField(pressureField ?? { nodes: [] })
        : null,
    recomputationCount: 0,
    decisions: []
  };
}

export function observePolicyEvent(state, event) {
  if (!state || !event) {
    throw new TypeError("observePolicyEvent requires state and event");
  }

  let shouldRecompute = false;
  let reason = "no_trigger";
  let pressureTriggers = [];

  if (state.policy === "static") {
    shouldRecompute = false;
    reason = "static_no_recompute";
  } else if (state.policy === "greedy") {
    shouldRecompute = event.observable !== false;
    reason = shouldRecompute ? "observable_event" : "not_observable";
  } else if (state.policy === "plh_direct") {
    shouldRecompute = event.directTrigger === true;
    reason = shouldRecompute
      ? "direct_semantic_trigger"
      : "no_direct_trigger";
  } else if (
    state.policy === "plh_pressure" ||
    state.policy === "plh_hybrid" ||
    state.policy === "plh_hybrid_guarded"
  ) {
    let field = state.pressureField;

    for (const increment of event.pressureAdds ?? []) {
      field = addPressure(field, {
        nodeId: increment.nodeId,
        amount: increment.amount,
        reason: event.eventId ?? null,
        at: event.tMs ?? null
      });
    }

    const stabilized = stabilizePressureField(field, {
      at: event.tMs ?? null
    });

    state.pressureField = stabilized.field;
    pressureTriggers = stabilized.triggers;

    const directTrigger =
      (
        state.policy === "plh_hybrid" ||
        state.policy === "plh_hybrid_guarded"
      ) &&
      event.directTrigger === true;
    const pressureTriggered = pressureTriggers.length > 0;

    shouldRecompute = directTrigger || pressureTriggered;

    if (directTrigger && pressureTriggered) {
      reason = [
        "direct_semantic_trigger",
        ...pressureTriggers.map(
          (trigger) => `${trigger.kind}:${trigger.id}`
        )
      ].join(",");
    } else if (directTrigger) {
      reason = "direct_semantic_trigger";
    } else if (pressureTriggered) {
      reason = pressureTriggers
        .map((trigger) => `${trigger.kind}:${trigger.id}`)
        .join(",");
    } else {
      reason = "below_pressure_threshold";
    }
  } else {
    throw new TypeError(`Unknown policy: ${state.policy}`);
  }

  if (shouldRecompute) state.recomputationCount += 1;

  const decision = {
    eventId: event.eventId ?? null,
    tMs: event.tMs ?? null,
    shouldRecompute,
    reason,
    pressureTriggers
  };

  state.decisions.push(decision);

  return {
    state,
    decision
  };
}

