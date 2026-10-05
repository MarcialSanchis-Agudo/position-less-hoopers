import { isNeedTerminal } from "./need.mjs";

const RESPONSIBILITY_STATUSES = new Set([
  "offered",
  "accepted",
  "active",
  "released",
  "revoked",
  "completed"
]);

const TERMINAL_RESPONSIBILITY_STATUSES = new Set([
  "released",
  "revoked",
  "completed"
]);

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function timestamp(value, label) {
  if (!nonEmptyString(value) || !Number.isFinite(Date.parse(value))) {
    throw new TypeError(`${label} must be a valid timestamp`);
  }
  return String(value);
}

function sortedUnique(values = []) {
  return [...new Set(
    values.filter((value) => nonEmptyString(value)).map((value) => value.trim())
  )].sort((a, b) => a.localeCompare(b));
}

function normalizeAuthority(authority = {}) {
  return {
    investigate: authority.investigate === true,
    propose: authority.propose === true,
    execute: authority.execute === true,
    requestHelp: authority.requestHelp === true,
    mutateScopes: sortedUnique(authority.mutateScopes)
  };
}

export function validateResponsibilityOffer(input) {
  const errors = [];

  if (!nonEmptyString(input?.id)) errors.push("id must be a non-empty string");
  if (!input?.need || !nonEmptyString(input.need.id)) errors.push("need must be an admitted Need");
  if (input?.need && isNeedTerminal(input.need)) errors.push("cannot assign a terminal Need");
  if (!nonEmptyString(input?.assigneeId)) errors.push("assigneeId must be a non-empty string");
  if (!Number.isInteger(input?.assignmentVersion) || input.assignmentVersion < 1) {
    errors.push("assignmentVersion must be a positive integer");
  }

  for (const key of ["offeredAt", "renewAfter", "expiresAt"]) {
    if (!nonEmptyString(input?.[key]) || !Number.isFinite(Date.parse(input[key]))) {
      errors.push(`${key} must be a valid timestamp`);
    }
  }

  if (
    nonEmptyString(input?.offeredAt) &&
    nonEmptyString(input?.renewAfter) &&
    Number.isFinite(Date.parse(input.offeredAt)) &&
    Number.isFinite(Date.parse(input.renewAfter)) &&
    Date.parse(input.renewAfter) < Date.parse(input.offeredAt)
  ) {
    errors.push("renewAfter must not precede offeredAt");
  }

  if (
    nonEmptyString(input?.renewAfter) &&
    nonEmptyString(input?.expiresAt) &&
    Number.isFinite(Date.parse(input.renewAfter)) &&
    Number.isFinite(Date.parse(input.expiresAt)) &&
    Date.parse(input.expiresAt) <= Date.parse(input.renewAfter)
  ) {
    errors.push("expiresAt must be later than renewAfter");
  }

  return { ok: errors.length === 0, errors };
}

export function createResponsibilityOffer(input) {
  const validation = validateResponsibilityOffer(input);
  if (!validation.ok) {
    throw new TypeError(`Invalid Responsibility offer: ${validation.errors.join("; ")}`);
  }

  return {
    schemaVersion: 1,
    id: String(input.id),
    needId: String(input.need.id),
    assigneeId: String(input.assigneeId),
    assignmentVersion: input.assignmentVersion,
    authority: normalizeAuthority(input.authority),
    evidenceObligations: sortedUnique(input.evidenceObligations ?? input.need.evidenceObligations),
    acquiredAt: null,
    offeredAt: timestamp(input.offeredAt, "offeredAt"),
    renewAfter: timestamp(input.renewAfter, "renewAfter"),
    expiresAt: timestamp(input.expiresAt, "expiresAt"),
    handoffFrom: input.handoffFrom == null ? null : String(input.handoffFrom),
    handoffReason: input.handoffReason == null ? null : String(input.handoffReason),
    status: "offered",
    releasedAt: null,
    releaseReason: null,
    completedAt: null
  };
}

export function responsibilityExpired(responsibility, now) {
  const at = timestamp(now, "now");
  return Date.parse(at) >= Date.parse(responsibility.expiresAt);
}

function transition(responsibility, nextStatus, now, extra = {}) {
  if (!RESPONSIBILITY_STATUSES.has(responsibility?.status)) {
    throw new TypeError("Responsibility has invalid current status");
  }
  if (!RESPONSIBILITY_STATUSES.has(nextStatus)) {
    throw new TypeError("Responsibility has invalid next status");
  }
  if (TERMINAL_RESPONSIBILITY_STATUSES.has(responsibility.status)) {
    throw new TypeError(`Responsibility is terminal: ${responsibility.status}`);
  }
  return {
    ...responsibility,
    status: nextStatus,
    ...extra,
    updatedAt: timestamp(now, "now")
  };
}

export function acceptResponsibility(responsibility, now) {
  if (responsibility.status !== "offered") {
    throw new TypeError("Only offered responsibilities may be accepted");
  }
  if (responsibilityExpired(responsibility, now)) {
    throw new TypeError("Cannot accept an expired Responsibility");
  }
  return transition(responsibility, "accepted", now, {
    acquiredAt: timestamp(now, "now")
  });
}

export function activateResponsibility(responsibility, now) {
  if (!["offered", "accepted"].includes(responsibility.status)) {
    throw new TypeError("Only offered or accepted responsibilities may become active");
  }
  if (responsibilityExpired(responsibility, now)) {
    throw new TypeError("Cannot activate an expired Responsibility");
  }
  return transition(responsibility, "active", now, {
    acquiredAt: responsibility.acquiredAt ?? timestamp(now, "now")
  });
}

export function releaseResponsibility(responsibility, now, reason = null) {
  return transition(responsibility, "released", now, {
    releasedAt: timestamp(now, "now"),
    releaseReason: reason == null ? null : String(reason)
  });
}

export function revokeResponsibility(responsibility, now, reason = null) {
  return transition(responsibility, "revoked", now, {
    releasedAt: timestamp(now, "now"),
    releaseReason: reason == null ? null : String(reason)
  });
}

export function completeResponsibility(responsibility, now) {
  if (!["accepted", "active"].includes(responsibility.status)) {
    throw new TypeError("Responsibility must be accepted or active before completion");
  }
  return transition(responsibility, "completed", now, {
    completedAt: timestamp(now, "now")
  });
}

export function renewResponsibility(responsibility, {
  now,
  renewAfter,
  expiresAt
}) {
  if (!["accepted", "active"].includes(responsibility.status)) {
    throw new TypeError("Only accepted or active responsibilities may be renewed");
  }
  if (responsibilityExpired(responsibility, now)) {
    throw new TypeError("Cannot renew an expired Responsibility");
  }

  const nextRenew = timestamp(renewAfter, "renewAfter");
  const nextExpiry = timestamp(expiresAt, "expiresAt");
  if (Date.parse(nextRenew) < Date.parse(now)) {
    throw new TypeError("renewAfter must not precede now");
  }
  if (Date.parse(nextExpiry) <= Date.parse(nextRenew)) {
    throw new TypeError("expiresAt must be later than renewAfter");
  }

  return {
    ...responsibility,
    renewAfter: nextRenew,
    expiresAt: nextExpiry,
    updatedAt: timestamp(now, "now")
  };
}

export function responsibilityCoversNeed(responsibility, need) {
  return responsibility?.needId === need?.id &&
    !TERMINAL_RESPONSIBILITY_STATUSES.has(responsibility?.status) &&
    !isNeedTerminal(need);
}

