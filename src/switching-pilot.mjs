import { rankCandidates } from "./matcher.mjs";
import { evaluateSwitch } from "./switching.mjs";

function candidateFromState(id, state, currentNeedId, contextRef) {
  return {
    id,
    capabilities: ["implement"],
    capabilityScores: { implement: state.capability },
    contextRefs: state.situated ? [contextRef] : [],
    currentNeedId,
    available: state.available !== false,
    failed: state.failed === true,
    blocked: state.blocked === true,
    stalled: state.stalled === true
  };
}

function rankedBest(candidates, need, mode = "capability_situated") {
  return rankCandidates(candidates, need, { mode })[0] ?? null;
}

function simulatedNeed(contextRef) {
  return {
    id: "need-switching-pilot",
    requiredCapabilities: ["implement"],
    requiredTools: [],
    requiredPermissions: [],
    contextRefs: [contextRef]
  };
}

function initialResponsibility(assigneeId, t0) {
  return {
    id: "responsibility-pilot-1",
    needId: "need-switching-pilot",
    assigneeId,
    assignmentVersion: 1,
    authority: {},
    offeredAt: t0,
    acquiredAt: t0,
    renewAfter: new Date(Date.parse(t0) + 300000).toISOString(),
    expiresAt: new Date(Date.parse(t0) + 600000).toISOString(),
    status: "active"
  };
}

function toIso(baseMs, offsetMs) {
  return new Date(baseMs + offsetMs).toISOString();
}

export function simulateSwitchingPolicy(scenario, policyName, options = {}) {
  const timeline = scenario.timeline ?? [];
  if (timeline.length === 0) throw new TypeError("scenario timeline is empty");

  const contextRef = scenario.initial?.needContextRef ?? "context";
  const baseMs = Date.parse(options.baseTime ?? "2026-09-28T15:00:00.000Z");
  const need = simulatedNeed(contextRef);
  let responsibility = initialResponsibility(
    scenario.initial?.assigneeId ?? "a",
    toIso(baseMs, timeline[0].tMs ?? 0)
  );
  let lastSwitchAt = null;
  let switchCount = 0;
  let unnecessarySwitchCount = 0;
  let contextReloadEvents = 0;
  let workerLossAt = null;
  let recoveryAt = null;
  const events = [];

  for (const point of timeline) {
    const now = toIso(baseMs, point.tMs);
    const candidateEntries = Object.entries(point.candidates ?? {});
    const candidates = candidateEntries.map(([id, state]) =>
      candidateFromState(id, state, need.id, contextRef)
    );

    const currentState = point.candidates?.[responsibility.assigneeId] ?? null;
    const currentOperational = currentState != null && currentState.available !== false;

    if (point.perturbation === "worker_loss") {
      workerLossAt = point.tMs;
      if (!currentOperational) {
        events.push({
          tMs: point.tMs,
          type: "CoverageLost",
          assigneeId: responsibility.assigneeId
        });
      }
    }

    if (policyName === "no_switch") {
      events.push({
        tMs: point.tMs,
        type: "Stayed",
        assigneeId: responsibility.assigneeId,
        reason: "policy_no_switch"
      });
    } else if (policyName === "greedy_switch") {
      const best = rankedBest(candidates, need);
      const current = candidates.find((candidate) => candidate.id === responsibility.assigneeId);
      const currentRank = current?.available === false ? null :
        rankCandidates(current ? [current] : [], need, { mode: "capability_situated" })[0] ?? null;

      if (best && best.candidateId !== responsibility.assigneeId) {
        const forced = !currentOperational || currentRank == null;
        const previous = responsibility.assigneeId;
        responsibility = {
          ...responsibility,
          id: `responsibility-pilot-${responsibility.assignmentVersion + 1}`,
          assigneeId: best.candidateId,
          assignmentVersion: responsibility.assignmentVersion + 1,
          offeredAt: now,
          acquiredAt: now
        };
        switchCount += 1;
        if (!forced && point.perturbation !== "worker_loss") unnecessarySwitchCount += 1;
        const targetState = point.candidates?.[best.candidateId];
        if (!targetState?.situated) contextReloadEvents += 1;
        lastSwitchAt = now;
        events.push({
          tMs: point.tMs,
          type: "Switched",
          fromAssigneeId: previous,
          toAssigneeId: best.candidateId,
          forced,
          reason: forced ? "current_unavailable" : "greedy_best"
        });
      } else {
        events.push({
          tMs: point.tMs,
          type: "Stayed",
          assigneeId: responsibility.assigneeId,
          reason: "already_best"
        });
      }
    } else if (policyName === "plh_hysteresis") {
      const decision = evaluateSwitch({
        need,
        responsibility,
        candidates,
        now,
        lastSwitchAt,
        matcherOptions: { mode: "capability_situated" },
        policy: options.switchPolicy
      });

      if (decision.shouldSwitch) {
        const previous = responsibility.assigneeId;
        responsibility = {
          ...responsibility,
          id: `responsibility-pilot-${responsibility.assignmentVersion + 1}`,
          assigneeId: decision.toAssigneeId,
          assignmentVersion: responsibility.assignmentVersion + 1,
          offeredAt: now,
          acquiredAt: now
        };
        switchCount += 1;
        if (!decision.forced) unnecessarySwitchCount += 1;
        const targetState = point.candidates?.[decision.toAssigneeId];
        if (!targetState?.situated) contextReloadEvents += 1;
        lastSwitchAt = now;
        events.push({
          tMs: point.tMs,
          type: "Switched",
          fromAssigneeId: previous,
          toAssigneeId: decision.toAssigneeId,
          forced: decision.forced,
          reason: decision.reason,
          scoreDelta: decision.scoreDelta
        });
      } else {
        events.push({
          tMs: point.tMs,
          type: "Stayed",
          assigneeId: responsibility.assigneeId,
          reason: decision.reason
        });
      }
    } else {
      throw new TypeError(`Unknown switching policy: ${policyName}`);
    }

    if (
      workerLossAt != null &&
      recoveryAt == null &&
      point.candidates?.[responsibility.assigneeId]?.available !== false
    ) {
      recoveryAt = point.tMs;
      events.push({
        tMs: point.tMs,
        type: "CoverageRestored",
        assigneeId: responsibility.assigneeId
      });
    }
  }

  const lastPoint = timeline.at(-1);
  const finalOperational = lastPoint?.candidates?.[responsibility.assigneeId]?.available !== false;
  const uncoveredAfterWorkerLossMs = workerLossAt == null
    ? 0
    : recoveryAt == null
      ? Math.max(0, lastPoint.tMs - workerLossAt)
      : Math.max(0, recoveryAt - workerLossAt);

  return {
    schemaVersion: 1,
    scenarioId: scenario.scenarioId,
    policy: policyName,
    switchCount,
    unnecessarySwitchCount,
    contextReloadEvents,
    workerLossAtMs: workerLossAt,
    recoveryAtMs: recoveryAt,
    uncoveredAfterWorkerLossMs,
    finalAssigneeId: responsibility.assigneeId,
    finalOperational,
    events
  };
}

export function compareSwitchingPolicies(scenario, options = {}) {
  const policies = scenario.policies ?? [
    "no_switch",
    "greedy_switch",
    "plh_hysteresis"
  ];

  return {
    schemaVersion: 1,
    scenarioId: scenario.scenarioId,
    runs: policies.map((policy) =>
      simulateSwitchingPolicy(scenario, policy, options)
    )
  };
}

