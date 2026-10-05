import {
  admitNeedProposal,
  isNeedTerminal
} from "./need.mjs";
import {
  allocateNextResponsibility
} from "./allocator.mjs";
import {
  startResponsibility,
  finishResponsibility
} from "./cycle.mjs";
import {
  proposeHelpNeed
} from "./help.mjs";
import {
  executeSwitch
} from "./switching.mjs";

function sortedUnique(values = []) {
  return [...new Set(
    values.filter((value) => typeof value === "string" && value.length > 0)
  )].sort((a, b) => a.localeCompare(b));
}

function cloneRegion(region) {
  return {
    ...region,
    needs: [...region.needs],
    responsibilities: [...region.responsibilities],
    evidenceRefs: [...region.evidenceRefs],
    events: [...region.events]
  };
}

function replaceById(items, next) {
  return items.map((item) => item.id === next.id ? next : item);
}

function activeNeedIds(region) {
  return region.needs
    .filter((need) => !isNeedTerminal(need))
    .map((need) => need.id)
    .sort();
}

function activeResponsibilities(region) {
  return region.responsibilities.filter((responsibility) =>
    !["released", "revoked", "completed"].includes(responsibility.status)
  );
}

export function createAdaptiveRegion({
  id,
  goalId,
  stateVersion,
  exitConditions = [],
  enteredAt
}) {
  if (!id || !goalId || !stateVersion) {
    throw new TypeError("AdaptiveRegion requires id, goalId, and stateVersion");
  }
  if (!Number.isFinite(Date.parse(enteredAt))) {
    throw new TypeError("enteredAt must be a valid timestamp");
  }

  return {
    schemaVersion: 1,
    id,
    goalId,
    stateVersion,
    status: "active",
    exitConditions: sortedUnique(exitConditions),
    evidenceRefs: [],
    needs: [],
    responsibilities: [],
    enteredAt,
    exitedAt: null,
    exitReason: null,
    events: [{
      type: "AdaptiveRegionEntered",
      regionId: id,
      goalId,
      stateVersion,
      at: enteredAt
    }]
  };
}

export function regionCanExit(region) {
  const evidence = new Set(region.evidenceRefs);
  const exitsMet = region.exitConditions.every((condition) => evidence.has(condition));
  const unresolvedNeeds = activeNeedIds(region);

  return {
    canExit: exitsMet && unresolvedNeeds.length === 0,
    exitsMet,
    unresolvedNeedIds: unresolvedNeeds,
    missingExitConditions: region.exitConditions.filter((condition) => !evidence.has(condition))
  };
}

export function recordRegionEvidence(region, refs = [], at) {
  const next = cloneRegion(region);
  next.evidenceRefs = sortedUnique([...next.evidenceRefs, ...refs]);
  next.events.push({
    type: "RegionEvidenceRecorded",
    regionId: region.id,
    refs: sortedUnique(refs),
    at
  });
  return next;
}

export function tryExitAdaptiveRegion(region, {
  at,
  reason = "exit_conditions_met"
} = {}) {
  const check = regionCanExit(region);
  if (!check.canExit) {
    return {
      exited: false,
      region,
      check
    };
  }

  const next = cloneRegion(region);
  next.status = "completed";
  next.exitedAt = at;
  next.exitReason = reason;
  next.events.push({
    type: "AdaptiveRegionExited",
    regionId: region.id,
    at,
    reason
  });

  return {
    exited: true,
    region: next,
    check
  };
}

export function admitRegionNeed(region, proposal, options = {}) {
  if (region.status !== "active") {
    throw new TypeError("Cannot admit Need into inactive AdaptiveRegion");
  }

  const admission = admitNeedProposal(proposal, region.needs, options);
  const next = cloneRegion(region);

  if (admission.status === "admitted") {
    next.needs.push(admission.need);
  }

  next.events.push({
    type: admission.status === "admitted"
      ? "RegionNeedAdmitted"
      : admission.status === "duplicate"
        ? "RegionNeedDuplicate"
        : "RegionNeedRejected",
    regionId: region.id,
    needId: admission.need?.id ?? null,
    status: admission.status,
    at: options.now ?? null
  });

  return {
    region: next,
    admission
  };
}

export function allocateRegionNext(region, {
  candidates,
  satisfiedNeedIds = [],
  matcherOptions = {},
  needSelectionOptions = {},
  authorityForNeed,
  leaseForNeed,
  assignmentVersionByNeed = {}
}) {
  if (region.status !== "active") {
    throw new TypeError("Cannot allocate in inactive AdaptiveRegion");
  }

  const allocation = allocateNextResponsibility({
    needs: region.needs,
    candidates,
    existingResponsibilities: region.responsibilities,
    satisfiedNeedIds,
    teamNeeds: region.needs.filter((need) =>
      ["assigned", "active"].includes(need.status)
    ),
    needSelectionOptions,
    matcherOptions,
    assignmentVersionByNeed,
    authorityForNeed,
    leaseForNeed
  });

  const next = cloneRegion(region);

  if (allocation.assignment?.status === "assigned") {
    next.needs = replaceById(next.needs, allocation.assignment.need);
    next.responsibilities.push(allocation.assignment.responsibility);
  }

  next.events.push({
    type: "RegionAllocationDecision",
    regionId: region.id,
    status: allocation.status,
    needId: allocation.needDecision.selectedNeedId,
    responsibilityId: allocation.assignment?.responsibility?.id ?? null,
    assigneeId: allocation.assignment?.responsibility?.assigneeId ?? null
  });

  return {
    region: next,
    allocation
  };
}

export function startRegionResponsibility(region, {
  responsibilityId,
  acceptedAt,
  activatedAt = acceptedAt
}) {
  const responsibility = region.responsibilities.find((item) => item.id === responsibilityId);
  if (!responsibility) throw new TypeError("Responsibility not found in AdaptiveRegion");

  const need = region.needs.find((item) => item.id === responsibility.needId);
  if (!need) throw new TypeError("Need not found in AdaptiveRegion");

  const started = startResponsibility({
    need,
    responsibility,
    acceptedAt,
    activatedAt
  });

  const next = cloneRegion(region);
  next.needs = replaceById(next.needs, started.need);
  next.responsibilities = replaceById(next.responsibilities, started.responsibility);
  next.events.push(...started.events.map((event) => ({
    ...event,
    regionId: region.id,
    at: activatedAt
  })));

  return {
    region: next,
    started
  };
}

export function applyRegionHelpSignal(region, signal, options = {}) {
  if (region.status !== "active") {
    throw new TypeError("Cannot apply Help signal to inactive AdaptiveRegion");
  }

  const result = proposeHelpNeed(signal, region.needs, options);
  const next = cloneRegion(region);

  if (result.admission.status === "admitted") {
    next.needs.push(result.admission.need);
  }

  next.events.push({
    type: result.admission.status === "admitted"
      ? "RegionHelpNeedAdmitted"
      : result.admission.status === "duplicate"
        ? "RegionHelpNeedDuplicate"
        : "RegionHelpNeedRejected",
    regionId: region.id,
    parentNeedId: signal.parentNeedId,
    needId: result.admission.need?.id ?? null,
    signalKind: signal.kind,
    at: options.now ?? null
  });

  return {
    region: next,
    help: result
  };
}

export function finishRegionResponsibility(region, {
  responsibilityId,
  completedAt,
  evidenceRefs = []
}) {
  const responsibility = region.responsibilities.find((item) => item.id === responsibilityId);
  if (!responsibility) throw new TypeError("Responsibility not found in AdaptiveRegion");
  const need = region.needs.find((item) => item.id === responsibility.needId);
  if (!need) throw new TypeError("Need not found in AdaptiveRegion");

  const finished = finishResponsibility({
    need,
    responsibility,
    completedAt,
    evidenceRefs
  });

  let next = cloneRegion(region);
  next.needs = replaceById(next.needs, finished.need);
  next.responsibilities = replaceById(next.responsibilities, finished.responsibility);
  next.events.push(...finished.events.map((event) => ({
    ...event,
    regionId: region.id,
    at: completedAt
  })));

  if (finished.status === "need_satisfied") {
    next = recordRegionEvidence(next, evidenceRefs, completedAt);
  }

  return {
    region: next,
    finished
  };
}

export function switchRegionResponsibility(region, {
  responsibilityId,
  candidates,
  now,
  lastSwitchAt = null,
  matcherOptions = {},
  policy = {},
  lease
}) {
  const responsibility = region.responsibilities.find((item) => item.id === responsibilityId);
  if (!responsibility) throw new TypeError("Responsibility not found in AdaptiveRegion");
  const need = region.needs.find((item) => item.id === responsibility.needId);
  if (!need) throw new TypeError("Need not found in AdaptiveRegion");

  const switched = executeSwitch({
    need,
    responsibility,
    candidates,
    now,
    lastSwitchAt,
    matcherOptions,
    policy,
    lease
  });

  const next = cloneRegion(region);

  if (switched.status === "switched") {
    next.needs = replaceById(next.needs, switched.need);
    next.responsibilities = replaceById(
      next.responsibilities,
      switched.previousResponsibility
    );
    next.responsibilities.push(switched.responsibility);
  }

  next.events.push(...switched.events.map((event) => ({
    ...event,
    regionId: region.id,
    at: now
  })));

  return {
    region: next,
    switched
  };
}

export function adaptiveRegionSnapshot(region) {
  return {
    schemaVersion: 1,
    id: region.id,
    goalId: region.goalId,
    stateVersion: region.stateVersion,
    status: region.status,
    activeNeedIds: activeNeedIds(region),
    activeResponsibilityIds: activeResponsibilities(region).map((item) => item.id).sort(),
    evidenceRefs: sortedUnique(region.evidenceRefs),
    exit: regionCanExit(region)
  };
}

