import crypto from "node:crypto";
import { assignmentDecision } from "./matcher.mjs";
import {
  isNeedTerminal,
  satisfyNeed,
  transitionNeed
} from "./need.mjs";
import {
  acceptResponsibility,
  activateResponsibility,
  completeResponsibility,
  createResponsibilityOffer,
  releaseResponsibility,
  responsibilityCoversNeed,
  revokeResponsibility
} from "./responsibility.mjs";

function sortedUnique(values = []) {
  return [...new Set(
    values.filter((value) => typeof value === "string" && value.length > 0)
  )].sort((a, b) => a.localeCompare(b));
}

function deterministicResponsibilityId(needId, assigneeId, assignmentVersion) {
  const digest = crypto
    .createHash("sha256")
    .update(`${needId}\0${assigneeId}\0${assignmentVersion}`)
    .digest("hex")
    .slice(0, 16);
  return `responsibility_${digest}`;
}

export function needToMatchRequest(need, options = {}) {
  return {
    id: need.id,
    requiredCapabilities: sortedUnique(need.requirements?.capabilities),
    requiredTools: sortedUnique(need.requirements?.toolAccess),
    requiredPermissions: sortedUnique(need.requirements?.permissions),
    contextRefs: sortedUnique(need.requirements?.contextRefs),
    staticPreference: sortedUnique(options.staticPreference)
  };
}

export function activeResponsibilitiesForNeed(need, responsibilities = []) {
  return responsibilities
    .filter((responsibility) => responsibilityCoversNeed(responsibility, need))
    .sort((a, b) =>
      a.assignmentVersion - b.assignmentVersion ||
      a.id.localeCompare(b.id)
    );
}

export function assignNeed({
  need,
  candidates = [],
  existingResponsibilities = [],
  matcherOptions = {},
  staticPreference = [],
  assignmentVersion = 1,
  responsibilityId = null,
  authority = {},
  offeredAt,
  renewAfter,
  expiresAt,
  handoffFrom = null,
  handoffReason = null
}) {
  if (!need || typeof need !== "object") {
    throw new TypeError("assignNeed requires an admitted Need");
  }
  if (isNeedTerminal(need)) {
    return {
      schemaVersion: 1,
      status: "terminal_need",
      need,
      responsibility: null,
      decision: null,
      events: []
    };
  }
  if (!["open", "blocked", "assigned", "active"].includes(need.status)) {
    throw new TypeError(`Need cannot be assigned from status: ${need.status}`);
  }
  if (!Number.isInteger(assignmentVersion) || assignmentVersion < 1) {
    throw new TypeError("assignmentVersion must be a positive integer");
  }

  const currentCoverage = activeResponsibilitiesForNeed(need, existingResponsibilities);
  if (
    currentCoverage.length > 0 &&
    need.redundancyPolicy !== "independent_duplicate"
  ) {
    return {
      schemaVersion: 1,
      status: "already_covered",
      need,
      responsibility: null,
      decision: null,
      events: []
    };
  }

  const matchNeed = needToMatchRequest(need, { staticPreference });
  const decision = assignmentDecision({
    need: matchNeed,
    candidates,
    options: matcherOptions
  });

  if (decision.selectedCandidateId == null) {
    const nextNeed = need.status === "blocked"
      ? need
      : transitionNeed(need, "blocked", {
          now: offeredAt ?? need.updatedAt ?? null,
          reason: "no_feasible_candidate"
        });

    return {
      schemaVersion: 1,
      status: "unassigned",
      need: nextNeed,
      responsibility: null,
      decision,
      events: [{
        type: "AssignmentDeferred",
        needId: need.id,
        reason: "no_feasible_candidate",
        assignmentVersion
      }]
    };
  }

  const selectedCandidateId = decision.selectedCandidateId;
  const nextNeed = need.status === "assigned" || need.status === "active"
    ? need
    : transitionNeed(need, "assigned", {
        now: offeredAt ?? need.updatedAt ?? null,
        reason: "responsibility_offered"
      });

  const responsibility = createResponsibilityOffer({
    id: responsibilityId ??
      deterministicResponsibilityId(need.id, selectedCandidateId, assignmentVersion),
    need: nextNeed,
    assigneeId: selectedCandidateId,
    assignmentVersion,
    authority,
    evidenceObligations: need.evidenceObligations,
    offeredAt,
    renewAfter,
    expiresAt,
    handoffFrom,
    handoffReason
  });

  return {
    schemaVersion: 1,
    status: "assigned",
    need: nextNeed,
    responsibility,
    decision,
    events: [{
      type: "AssignmentDecision",
      needId: need.id,
      responsibilityId: responsibility.id,
      assigneeId: selectedCandidateId,
      assignmentVersion,
      mode: decision.mode
    }]
  };
}

export function startResponsibility({
  need,
  responsibility,
  acceptedAt,
  activatedAt = acceptedAt
}) {
  if (responsibility.needId !== need.id) {
    throw new TypeError("Responsibility does not belong to Need");
  }
  if (isNeedTerminal(need)) {
    throw new TypeError("Cannot start Responsibility for terminal Need");
  }

  const accepted = responsibility.status === "offered"
    ? acceptResponsibility(responsibility, acceptedAt)
    : responsibility;

  const active = accepted.status === "accepted"
    ? activateResponsibility(accepted, activatedAt)
    : accepted;

  if (active.status !== "active") {
    throw new TypeError("Responsibility could not become active");
  }

  const activeNeed = need.status === "active"
    ? need
    : transitionNeed(need, "active", {
        now: activatedAt,
        reason: "responsibility_active"
      });

  return {
    schemaVersion: 1,
    need: activeNeed,
    responsibility: active,
    events: [{
      type: "ResponsibilityActivated",
      needId: activeNeed.id,
      responsibilityId: active.id,
      assigneeId: active.assigneeId,
      assignmentVersion: active.assignmentVersion
    }]
  };
}

function unresolvedAfterTerminalResponsibility(need, now, reason) {
  if (isNeedTerminal(need)) return need;
  if (need.status === "open") return need;
  return transitionNeed(need, "open", {
    now,
    reason
  });
}

export function finishResponsibility({
  need,
  responsibility,
  completedAt,
  evidenceRefs = []
}) {
  if (responsibility.needId !== need.id) {
    throw new TypeError("Responsibility does not belong to Need");
  }

  const completed = completeResponsibility(responsibility, completedAt);
  const satisfaction = satisfyNeed(need, evidenceRefs, {
    now: completedAt,
    reason: "evidence_obligations_met"
  });

  if (satisfaction.satisfied) {
    return {
      schemaVersion: 1,
      status: "need_satisfied",
      need: satisfaction.need,
      responsibility: completed,
      events: [
        {
          type: "ResponsibilityCompleted",
          needId: need.id,
          responsibilityId: completed.id,
          assigneeId: completed.assigneeId
        },
        {
          type: "NeedSatisfied",
          needId: need.id,
          responsibilityId: completed.id,
          evidenceRefs: sortedUnique(evidenceRefs)
        }
      ]
    };
  }

  const reopenedNeed = unresolvedAfterTerminalResponsibility(
    need,
    completedAt,
    "responsibility_completed_without_need_satisfaction"
  );

  return {
    schemaVersion: 1,
    status: "need_reopened",
    need: reopenedNeed,
    responsibility: completed,
    events: [
      {
        type: "ResponsibilityCompleted",
        needId: need.id,
        responsibilityId: completed.id,
        assigneeId: completed.assigneeId
      },
      {
        type: "NeedReopened",
        needId: need.id,
        responsibilityId: completed.id,
        reason: "missing_evidence"
      }
    ]
  };
}

export function endResponsibilityWithoutCompletion({
  need,
  responsibility,
  endedAt,
  kind = "released",
  reason = null
}) {
  if (responsibility.needId !== need.id) {
    throw new TypeError("Responsibility does not belong to Need");
  }
  if (!["released", "revoked"].includes(kind)) {
    throw new TypeError("kind must be released or revoked");
  }

  const ended = kind === "released"
    ? releaseResponsibility(responsibility, endedAt, reason)
    : revokeResponsibility(responsibility, endedAt, reason);

  const reopenedNeed = unresolvedAfterTerminalResponsibility(
    need,
    endedAt,
    kind === "released"
      ? "responsibility_released"
      : "responsibility_revoked"
  );

  return {
    schemaVersion: 1,
    status: "need_reopened",
    need: reopenedNeed,
    responsibility: ended,
    events: [
      {
        type: kind === "released"
          ? "ResponsibilityReleased"
          : "ResponsibilityRevoked",
        needId: need.id,
        responsibilityId: ended.id,
        reason
      },
      {
        type: "NeedReopened",
        needId: need.id,
        responsibilityId: ended.id,
        reason: reopenedNeed.statusReason
      }
    ]
  };
}

