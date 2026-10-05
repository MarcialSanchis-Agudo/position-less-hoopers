import { rankCandidates } from "./matcher.mjs";
import {
  assignNeed,
  endResponsibilityWithoutCompletion,
  needToMatchRequest
} from "./cycle.mjs";

export const DEFAULT_SWITCH_POLICY = Object.freeze({
  switchMargin: 0.10,
  minTenureMs: 120_000,
  cooldownMs: 180_000
});

function parseTime(value, label) {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new TypeError(`${label} must be a valid timestamp`);
  return ms;
}

function isOperational(candidate) {
  return candidate != null &&
    candidate.available !== false &&
    candidate.failed !== true &&
    candidate.blocked !== true &&
    candidate.stalled !== true;
}

function failureReason(candidate) {
  if (!candidate) return "current_candidate_missing";
  if (candidate.failed === true) return "current_failed";
  if (candidate.available === false) return "current_unavailable";
  if (candidate.blocked === true) return "current_blocked";
  if (candidate.stalled === true) return "current_stalled";
  return null;
}

export function evaluateSwitch({
  need,
  responsibility,
  candidates = [],
  now,
  lastSwitchAt = null,
  matcherOptions = {},
  policy = {}
}) {
  if (!need || responsibility?.needId !== need.id) {
    throw new TypeError("Switch evaluation requires a Responsibility for the Need");
  }
  if (!["accepted", "active"].includes(responsibility.status)) {
    throw new TypeError("Only accepted or active Responsibilities may be switched");
  }

  const at = parseTime(now, "now");
  const effectivePolicy = { ...DEFAULT_SWITCH_POLICY, ...policy };
  const currentCandidate = candidates.find(
    (candidate) => String(candidate.id) === responsibility.assigneeId
  ) ?? null;
  const forcedReason = failureReason(currentCandidate);

  const matchNeed = needToMatchRequest(need);
  const ranked = rankCandidates(
    candidates.filter(isOperational),
    matchNeed,
    matcherOptions
  );

  const currentRank = ranked.find(
    (entry) => entry.candidateId === responsibility.assigneeId
  ) ?? null;
  const bestAlternative = ranked.find(
    (entry) => entry.candidateId !== responsibility.assigneeId
  ) ?? null;

  if (!bestAlternative) {
    return {
      schemaVersion: 1,
      shouldSwitch: false,
      forced: forcedReason != null || currentRank == null,
      reason: forcedReason == null && currentRank != null
        ? "no_better_alternative"
        : "no_feasible_alternative",
      fromAssigneeId: responsibility.assigneeId,
      toAssigneeId: null,
      currentScore: currentRank?.score ?? null,
      alternativeScore: null,
      scoreDelta: null,
      guards: {
        tenureSatisfied: null,
        cooldownSatisfied: null,
        marginSatisfied: null
      },
      ranked
    };
  }

  if (forcedReason != null || currentRank == null) {
    return {
      schemaVersion: 1,
      shouldSwitch: true,
      forced: true,
      reason: forcedReason ?? "current_infeasible",
      fromAssigneeId: responsibility.assigneeId,
      toAssigneeId: bestAlternative.candidateId,
      currentScore: currentRank?.score ?? null,
      alternativeScore: bestAlternative.score,
      scoreDelta: currentRank == null
        ? null
        : bestAlternative.score.total - currentRank.score.total,
      guards: {
        tenureSatisfied: true,
        cooldownSatisfied: true,
        marginSatisfied: true
      },
      ranked
    };
  }

  const best = ranked[0];
  if (best.candidateId === responsibility.assigneeId) {
    return {
      schemaVersion: 1,
      shouldSwitch: false,
      forced: false,
      reason: "current_best",
      fromAssigneeId: responsibility.assigneeId,
      toAssigneeId: null,
      currentScore: currentRank.score,
      alternativeScore: bestAlternative.score,
      scoreDelta: bestAlternative.score.total - currentRank.score.total,
      guards: {
        tenureSatisfied: null,
        cooldownSatisfied: null,
        marginSatisfied: false
      },
      ranked
    };
  }

  const acquiredAt = responsibility.acquiredAt ?? responsibility.offeredAt;
  const tenureMs = at - parseTime(acquiredAt, "Responsibility acquiredAt/offeredAt");
  const tenureSatisfied = tenureMs >= effectivePolicy.minTenureMs;
  const cooldownSatisfied = lastSwitchAt == null
    ? true
    : at - parseTime(lastSwitchAt, "lastSwitchAt") >= effectivePolicy.cooldownMs;

  const scoreDelta = bestAlternative.score.total - currentRank.score.total;
  const marginSatisfied = scoreDelta > effectivePolicy.switchMargin;

  const shouldSwitch = tenureSatisfied && cooldownSatisfied && marginSatisfied;
  const reason = !tenureSatisfied
    ? "min_tenure"
    : !cooldownSatisfied
      ? "cooldown"
      : !marginSatisfied
        ? "hysteresis_margin"
        : "utility_improvement";

  return {
    schemaVersion: 1,
    shouldSwitch,
    forced: false,
    reason,
    fromAssigneeId: responsibility.assigneeId,
    toAssigneeId: shouldSwitch ? bestAlternative.candidateId : null,
    currentScore: currentRank.score,
    alternativeScore: bestAlternative.score,
    scoreDelta,
    tenureMs,
    guards: {
      tenureSatisfied,
      cooldownSatisfied,
      marginSatisfied
    },
    ranked
  };
}

export function executeSwitch({
  need,
  responsibility,
  candidates = [],
  now,
  lastSwitchAt = null,
  matcherOptions = {},
  policy = {},
  authority = responsibility?.authority ?? {},
  lease,
  decision = null
}) {
  if (!lease || typeof lease !== "object") {
    throw new TypeError("executeSwitch requires a replacement lease");
  }

  const evaluated = decision ?? evaluateSwitch({
    need,
    responsibility,
    candidates,
    now,
    lastSwitchAt,
    matcherOptions,
    policy
  });

  if (!evaluated.shouldSwitch) {
    return {
      schemaVersion: 1,
      status: "stayed",
      need,
      responsibility,
      previousResponsibility: null,
      switchDecision: evaluated,
      assignment: null,
      events: [{
        type: "SwitchDeferred",
        needId: need.id,
        responsibilityId: responsibility.id,
        assigneeId: responsibility.assigneeId,
        reason: evaluated.reason
      }]
    };
  }

  const target = candidates.find(
    (candidate) => String(candidate.id) === evaluated.toAssigneeId
  );
  if (!isOperational(target)) {
    return {
      schemaVersion: 1,
      status: "switch_failed",
      need,
      responsibility,
      previousResponsibility: null,
      switchDecision: evaluated,
      assignment: null,
      events: [{
        type: "SwitchFailed",
        needId: need.id,
        responsibilityId: responsibility.id,
        reason: "target_no_longer_operational"
      }]
    };
  }

  const ended = endResponsibilityWithoutCompletion({
    need,
    responsibility,
    endedAt: now,
    kind: "revoked",
    reason: `switch:${evaluated.reason}`
  });

  const assignment = assignNeed({
    need: ended.need,
    candidates: [target],
    existingResponsibilities: [ended.responsibility],
    matcherOptions,
    assignmentVersion: responsibility.assignmentVersion + 1,
    authority,
    offeredAt: lease.offeredAt,
    renewAfter: lease.renewAfter,
    expiresAt: lease.expiresAt,
    handoffFrom: responsibility.assigneeId,
    handoffReason: evaluated.reason
  });

  if (assignment.status !== "assigned") {
    return {
      schemaVersion: 1,
      status: "switch_failed_after_release",
      need: assignment.need,
      responsibility: null,
      previousResponsibility: ended.responsibility,
      switchDecision: evaluated,
      assignment,
      events: [
        ...ended.events,
        {
          type: "SwitchFailed",
          needId: need.id,
          responsibilityId: responsibility.id,
          reason: "replacement_assignment_failed"
        }
      ]
    };
  }

  return {
    schemaVersion: 1,
    status: "switched",
    need: assignment.need,
    responsibility: assignment.responsibility,
    previousResponsibility: ended.responsibility,
    switchDecision: evaluated,
    assignment,
    events: [
      ...ended.events,
      ...assignment.events,
      {
        type: "ResponsibilitySwitched",
        needId: need.id,
        fromResponsibilityId: responsibility.id,
        toResponsibilityId: assignment.responsibility.id,
        fromAssigneeId: responsibility.assigneeId,
        toAssigneeId: assignment.responsibility.assigneeId,
        assignmentVersion: assignment.responsibility.assignmentVersion,
        forced: evaluated.forced,
        reason: evaluated.reason,
        scoreDelta: evaluated.scoreDelta
      }
    ]
  };
}

