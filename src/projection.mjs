const DEFAULT_EXPECTED_WORK_STATUSES = new Set(["active", "running", "dispatchable"]);
const DEFAULT_WAITING_WORK_STATUSES = new Set(["waiting", "waiting_human"]);
const DEFAULT_LIVE_LIFECYCLES = new Set(["starting", "active", "waiting"]);
const DEFAULT_DEGRADED_LIFECYCLES = new Set(["blocked"]);

function sortedUnique(values = []) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))]
    .sort((a, b) => a.localeCompare(b));
}

function sortedIntersection(left = [], right = []) {
  const rightSet = new Set(right);
  return sortedUnique(left.filter((value) => rightSet.has(value)));
}

function stableWork(work = {}) {
  return {
    workId: String(work.workId ?? ""),
    stepId: work.stepId == null ? null : String(work.stepId),
    workflowRunId: work.workflowRunId == null ? null : String(work.workflowRunId),
    status: String(work.status ?? "unknown"),
    objective: work.objective == null ? null : String(work.objective),
    assignedSessionId: work.assignedSessionId == null ? null : String(work.assignedSessionId),
    workspaceId: work.workspaceId == null ? null : String(work.workspaceId),
    readSet: sortedUnique(work.readSet),
    writeSet: sortedUnique(work.writeSet),
    evidenceStatus: work.evidenceStatus == null ? null : String(work.evidenceStatus),
    refuteStatus: work.refuteStatus == null ? null : String(work.refuteStatus),
    lastTransitionId: work.lastTransitionId == null ? null : String(work.lastTransitionId)
  };
}

function stableAgent(agent = {}) {
  return {
    sessionId: String(agent.sessionId ?? ""),
    stepRunId: agent.stepRunId == null ? null : String(agent.stepRunId),
    adapterId: String(agent.adapterId ?? "unknown"),
    modelId: agent.modelId == null ? null : String(agent.modelId),
    lifecycle: String(agent.lifecycle ?? "unknown"),
    workspaceId: agent.workspaceId == null ? null : String(agent.workspaceId),
    workspaceVersionSeen: agent.workspaceVersionSeen == null ? null : String(agent.workspaceVersionSeen),
    progress: {
      outputSeq: Number.isInteger(agent.progress?.outputSeq) ? agent.progress.outputSeq : null,
      lastActivityAt: agent.progress?.lastActivityAt == null ? null : String(agent.progress.lastActivityAt),
      stalled: Boolean(agent.progress?.stalled)
    },
    operatingMode: agent.operatingMode == null ? null : String(agent.operatingMode),
    artifactRefs: sortedUnique(agent.artifactRefs),
    evidenceRefs: sortedUnique(agent.evidenceRefs)
  };
}

function workExpectedNow(status, expectedStatuses, waitingStatuses) {
  if (waitingStatuses.has(status)) return false;
  return expectedStatuses.has(status);
}

function coverageForWork(work, agentById, options) {
  if (!workExpectedNow(work.status, options.expectedWorkStatuses, options.waitingWorkStatuses)) {
    return null;
  }

  if (!work.assignedSessionId) {
    return {
      workId: work.workId,
      status: "uncovered",
      sessionId: null,
      reason: "no_assigned_session"
    };
  }

  const agent = agentById.get(work.assignedSessionId);
  if (!agent) {
    return {
      workId: work.workId,
      status: "uncovered",
      sessionId: work.assignedSessionId,
      reason: "session_missing"
    };
  }

  if (options.degradedLifecycles.has(agent.lifecycle) || agent.progress.stalled) {
    return {
      workId: work.workId,
      status: "degraded",
      sessionId: agent.sessionId,
      reason: agent.progress.stalled ? "stalled" : "blocked"
    };
  }

  if (options.liveLifecycles.has(agent.lifecycle)) {
    return {
      workId: work.workId,
      status: "covered",
      sessionId: agent.sessionId,
      reason: null
    };
  }

  return {
    workId: work.workId,
    status: "uncovered",
    sessionId: agent.sessionId,
    reason: "session_not_live"
  };
}

function deriveOverlaps(work) {
  const active = work.filter((item) =>
    DEFAULT_EXPECTED_WORK_STATUSES.has(item.status)
  );
  const overlaps = [];

  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const left = active[i];
      const right = active[j];
      const [leftWorkId, rightWorkId] = [left.workId, right.workId].sort((a, b) => a.localeCompare(b));

      const writeWrite = sortedIntersection(left.writeSet, right.writeSet);
      if (writeWrite.length > 0) {
        overlaps.push({
          leftWorkId,
          rightWorkId,
          kind: "write_write",
          refs: writeWrite
        });
      }

      const readWrite = sortedUnique([
        ...sortedIntersection(left.readSet, right.writeSet),
        ...sortedIntersection(right.readSet, left.writeSet)
      ]);
      if (readWrite.length > 0) {
        overlaps.push({
          leftWorkId,
          rightWorkId,
          kind: "read_write",
          refs: readWrite
        });
      }
    }
  }

  return overlaps.sort((a, b) =>
    a.kind.localeCompare(b.kind) ||
    a.leftWorkId.localeCompare(b.leftWorkId) ||
    a.rightWorkId.localeCompare(b.rightWorkId) ||
    a.refs.join("\u0000").localeCompare(b.refs.join("\u0000"))
  );
}

function deriveEvidenceGaps(work) {
  const gaps = [];

  for (const item of work) {
    if (item.evidenceStatus === "missing_execution_oracle") {
      gaps.push({ workId: item.workId, type: "missing_execution_oracle" });
    }
    if (item.evidenceStatus === "grounding_partial") {
      gaps.push({ workId: item.workId, type: "grounding_partial" });
    }
    if (item.evidenceStatus === "incomplete") {
      gaps.push({ workId: item.workId, type: "evidence_incomplete" });
    }
    if (item.refuteStatus === "uncertain") {
      gaps.push({ workId: item.workId, type: "refute_uncertain" });
    }
    if (item.refuteStatus === "unavailable") {
      gaps.push({ workId: item.workId, type: "refute_unavailable" });
    }
  }

  return gaps.sort((a, b) => a.workId.localeCompare(b.workId) || a.type.localeCompare(b.type));
}

function stableContentions(contentions = []) {
  return contentions.map((item) => ({
    workIds: sortedUnique(item.workIds),
    refs: sortedUnique(item.refs),
    severity: item.severity === "conflict" ? "conflict" : "observe",
    source: item.source === "belief_divergence" ? "belief_divergence" : "state_deps"
  })).sort((a, b) =>
    a.source.localeCompare(b.source) ||
    a.workIds.join("\u0000").localeCompare(b.workIds.join("\u0000")) ||
    a.refs.join("\u0000").localeCompare(b.refs.join("\u0000")) ||
    a.severity.localeCompare(b.severity)
  );
}

export function buildCoordinationField(input = {}, options = {}) {
  const expectedWorkStatuses = new Set(options.expectedWorkStatuses ?? DEFAULT_EXPECTED_WORK_STATUSES);
  const waitingWorkStatuses = new Set(options.waitingWorkStatuses ?? DEFAULT_WAITING_WORK_STATUSES);
  const liveLifecycles = new Set(options.liveLifecycles ?? DEFAULT_LIVE_LIFECYCLES);
  const degradedLifecycles = new Set(options.degradedLifecycles ?? DEFAULT_DEGRADED_LIFECYCLES);

  const agents = (input.agents ?? []).map(stableAgent)
    .sort((a, b) => a.sessionId.localeCompare(b.sessionId));
  const work = (input.work ?? []).map(stableWork)
    .sort((a, b) => a.workId.localeCompare(b.workId));

  const agentById = new Map(agents.map((agent) => [agent.sessionId, agent]));
  const coverage = work
    .map((item) => coverageForWork(item, agentById, {
      expectedWorkStatuses,
      waitingWorkStatuses,
      liveLifecycles,
      degradedLifecycles
    }))
    .filter(Boolean)
    .sort((a, b) => a.workId.localeCompare(b.workId));

  const uncovered = coverage
    .filter((item) => item.status === "uncovered")
    .map((item) => ({
      workId: item.workId,
      reason: item.reason,
      sessionId: item.sessionId
    }));

  const activeAgentCount = agents.filter((agent) =>
    liveLifecycles.has(agent.lifecycle) || degradedLifecycles.has(agent.lifecycle)
  ).length;

  return {
    schemaVersion: 1,
    goalId: String(input.goalId ?? ""),
    workflowRunId: input.workflowRunId == null ? null : String(input.workflowRunId),
    observedAt: String(options.observedAt ?? new Date().toISOString()),
    stateVersion: input.stateVersion == null ? null : String(input.stateVersion),
    agents,
    work,
    coverage,
    overlaps: deriveOverlaps(work),
    contentions: stableContentions(input.contentions),
    evidenceGaps: deriveEvidenceGaps(work),
    uncovered,
    resources: {
      activeAgentCount,
      concurrencyLimit: Number.isInteger(input.resources?.concurrencyLimit)
        ? input.resources.concurrencyLimit
        : null,
      knownCostUsd: Number.isFinite(input.resources?.knownCostUsd)
        ? input.resources.knownCostUsd
        : null,
      budgetRemainingUsd: Number.isFinite(input.resources?.budgetRemainingUsd)
        ? input.resources.budgetRemainingUsd
        : null
    },
    sourceRefs: {
      sessionIds: sortedUnique(input.sourceRefs?.sessionIds ?? agents.map((agent) => agent.sessionId)),
      stepRunIds: sortedUnique(input.sourceRefs?.stepRunIds ?? work.map((item) => item.workId)),
      harnessTransitionIds: sortedUnique(input.sourceRefs?.harnessTransitionIds)
    }
  };
}

