import { admitNeedProposal } from "./need.mjs";
import { assignNeed, startResponsibility } from "./cycle.mjs";
import { allocateNextResponsibility } from "./allocator.mjs";
import { choosePredefinedRole } from "./ontology-role-selector.mjs";

export const ONTOLOGY_STRESS_BASELINE_IDS = Object.freeze([
  "B0",
  "B1",
  "B2",
  "B3",
  "P"
]);

function workerMap(config) {
  return new Map(
    (config.workerProfiles ?? []).map((worker) => [worker.id, worker])
  );
}

function specialistIds(config) {
  return (config.workerProfiles ?? [])
    .map((worker) => worker.id)
    .filter((id) => id !== "generalist");
}

function roleNeed(roleId, role, scenario, evidenceRef) {
  return {
    goalId: `goal:ontology-stress:${scenario.scenarioId}`,
    objective: role.objective,
    rationale:
      `Responsibility is expressed through frozen predefined role ${roleId}.`,
    stateVersion:
      `${scenario.scenarioId}:v${scenario.targetContractVersion}:role:${roleId}`,
    requirements: {
      capabilities: role.requiredCapabilities ?? [],
      permissions: ["workspace-write"],
      contextRefs: role.contextRefs ?? []
    },
    coverage: {
      targetRefs: [
        "active-contract",
        "implementation",
        "authoritative-state"
      ],
      evidenceTypes: ["external-grader"],
      mutationScopes: ["implementation"]
    },
    urgency: 1,
    importance: 1,
    uncertainty: 0.5,
    risk: 0.7,
    expectedInformationGain: 0.6,
    redundancyPolicy: "exclusive",
    evidenceObligations: [evidenceRef],
    exitConditions: [evidenceRef],
    createdBy: "orchestrator_judgment"
  };
}

function stateNeed(scenario, evidenceRef) {
  return {
    goalId: `goal:ontology-stress:${scenario.scenarioId}`,
    objective:
      scenario.stateObjective ??
      "Resolve the current authoritative state and restore external correctness.",
    rationale:
      scenario.stateRationale ??
      "The state-derived Need is based on the current authoritative task state.",
    stateVersion:
      `${scenario.scenarioId}:v${scenario.targetContractVersion}:state-derived`,
    requirements: {
      capabilities: scenario.stateRequirements?.capabilities ?? [],
      permissions: ["workspace-write"],
      contextRefs: scenario.stateRequirements?.contextRefs ?? []
    },
    coverage: {
      targetRefs: [
        "active-contract",
        "implementation",
        "authoritative-state"
      ],
      evidenceTypes: ["external-grader"],
      mutationScopes: ["implementation"]
    },
    urgency: 1,
    importance: 1,
    uncertainty: 0.5,
    risk: 0.7,
    expectedInformationGain: 0.6,
    redundancyPolicy: "exclusive",
    evidenceObligations: [evidenceRef],
    exitConditions: [evidenceRef],
    createdBy: "deterministic_signal"
  };
}

function genericNeed({
  scenario,
  evidenceRef,
  objective,
  rationale,
  contextRefs
}) {
  return {
    goalId: `goal:ontology-stress:${scenario.scenarioId}`,
    objective,
    rationale,
    stateVersion:
      `${scenario.scenarioId}:v${scenario.targetContractVersion}:generic`,
    requirements: {
      capabilities: ["implement"],
      permissions: ["workspace-write"],
      contextRefs
    },
    coverage: {
      targetRefs: ["active-contract", "implementation"],
      evidenceTypes: ["external-grader"],
      mutationScopes: ["implementation"]
    },
    urgency: 1,
    importance: 1,
    uncertainty: 0.5,
    risk: 0.7,
    expectedInformationGain: 0.5,
    redundancyPolicy: "exclusive",
    evidenceObligations: [evidenceRef],
    exitConditions: [evidenceRef],
    createdBy: "orchestrator_judgment"
  };
}

function admit(proposal, baselineId, scenario, now) {
  const admission = admitNeedProposal(proposal, [], {
    id: `need:ontology-stress:${scenario.scenarioId}:${baselineId}`,
    now
  });

  if (admission.status !== "admitted") {
    throw new TypeError(
      `Ontology-stress Need admission failed: ${admission.reason}`
    );
  }

  return admission.need;
}

function lease(now) {
  const t = Date.parse(now);
  return {
    offeredAt: now,
    renewAfter: new Date(t + 5 * 60000).toISOString(),
    expiresAt: new Date(t + 30 * 60000).toISOString()
  };
}

function assignAndStart({
  need,
  candidates,
  matcherOptions,
  staticPreference = [],
  now
}) {
  const assignment = assignNeed({
    need,
    candidates,
    matcherOptions,
    staticPreference,
    assignmentVersion: 1,
    authority: {
      investigate: true,
      propose: true,
      execute: true,
      requestHelp: true,
      mutateScopes: ["implementation"]
    },
    ...lease(now)
  });

  if (assignment.status !== "assigned") {
    throw new TypeError(`Assignment failed: ${assignment.status}`);
  }

  const started = startResponsibility({
    need: assignment.need,
    responsibility: assignment.responsibility,
    acceptedAt: now,
    activatedAt: now
  });

  return { assignment, started };
}

export function planOntologyStressResponsibility({
  baselineId,
  scenario,
  evidenceRef,
  config,
  now = new Date().toISOString()
}) {
  if (!ONTOLOGY_STRESS_BASELINE_IDS.includes(baselineId)) {
    throw new TypeError(
      `Unsupported ontology-stress baseline: ${baselineId}`
    );
  }

  const workers = workerMap(config);
  const matcherOptions = config.matcherOptions ?? {
    mode: "capability_situated"
  };
  const teamCandidates = specialistIds(config)
    .map((id) => workers.get(id))
    .filter(Boolean);

  if (baselineId === "B0") {
    const need = admit(
      genericNeed({
        scenario,
        evidenceRef,
        objective:
          "Solve the current task state as one strong generalist.",
        rationale:
          "B0 uses the frozen strong generalist condition.",
        contextRefs: [
          "implementation",
          "contract",
          "tests",
          "evidence"
        ]
      }),
      baselineId,
      scenario,
      now
    );

    const { assignment, started } = assignAndStart({
      need,
      candidates: [workers.get("generalist")],
      matcherOptions: { mode: "static" },
      staticPreference: ["generalist"],
      now
    });

    return {
      schemaVersion: 1,
      baselineId,
      ontologyType: "single_generalist",
      selectedRoleId: null,
      roleDecision: null,
      assignmentDecision: assignment.decision,
      need: started.need,
      responsibility: started.responsibility,
      selectedWorkerId: started.responsibility.assigneeId,
      contextKinds:
        workers.get(started.responsibility.assigneeId)?.contextKinds ?? []
    };
  }

  if (baselineId === "B1") {
    const need = admit(
      genericNeed({
        scenario,
        evidenceRef,
        objective:
          "Execute the fixed implementation-owner workflow.",
        rationale:
          "B1 never changes responsibility ownership.",
        contextRefs: ["implementation"]
      }),
      baselineId,
      scenario,
      now
    );

    const { assignment, started } = assignAndStart({
      need,
      candidates: [workers.get("worker-implementation")],
      matcherOptions: { mode: "static" },
      staticPreference: ["worker-implementation"],
      now
    });

    return {
      schemaVersion: 1,
      baselineId,
      ontologyType: "static_workflow",
      selectedRoleId: "fixed_implementation_owner",
      roleDecision: null,
      assignmentDecision: assignment.decision,
      need: started.need,
      responsibility: started.responsibility,
      selectedWorkerId: started.responsibility.assigneeId,
      contextKinds:
        workers.get(started.responsibility.assigneeId)?.contextKinds ?? []
    };
  }

  const roleDecision = choosePredefinedRole({
    roles: config.predefinedRoles,
    stateRequirements: scenario.stateRequirements ?? {},
    weights: config.roleSelectionWeights
  });
  const selectedRoleId = roleDecision.selectedRoleId;
  const role = config.predefinedRoles?.[selectedRoleId];

  if (!role) {
    throw new TypeError(
      "Predefined role selection produced no role"
    );
  }

  if (baselineId === "B2") {
    const ownerId = config.fixedRoleOwners?.[selectedRoleId];
    if (!ownerId) {
      throw new TypeError(
        `No fixed owner for role ${selectedRoleId}`
      );
    }

    const need = admit(
      roleNeed(
        selectedRoleId,
        role,
        scenario,
        evidenceRef
      ),
      baselineId,
      scenario,
      now
    );

    const { assignment, started } = assignAndStart({
      need,
      candidates: [workers.get(ownerId)],
      matcherOptions: { mode: "static" },
      staticPreference: [ownerId],
      now
    });

    return {
      schemaVersion: 1,
      baselineId,
      ontologyType: "fixed_specialist_roles",
      selectedRoleId,
      roleDecision,
      assignmentDecision: assignment.decision,
      need: started.need,
      responsibility: started.responsibility,
      selectedWorkerId: started.responsibility.assigneeId,
      contextKinds:
        workers.get(started.responsibility.assigneeId)?.contextKinds ?? []
    };
  }

  if (baselineId === "B3") {
    const need = admit(
      roleNeed(
        selectedRoleId,
        role,
        scenario,
        evidenceRef
      ),
      baselineId,
      scenario,
      now
    );

    const { assignment, started } = assignAndStart({
      need,
      candidates: teamCandidates,
      matcherOptions,
      now
    });

    return {
      schemaVersion: 1,
      baselineId,
      ontologyType: "dynamic_predefined_roles",
      selectedRoleId,
      roleDecision,
      assignmentDecision: assignment.decision,
      need: started.need,
      responsibility: started.responsibility,
      selectedWorkerId: started.responsibility.assigneeId,
      contextKinds:
        workers.get(started.responsibility.assigneeId)?.contextKinds ?? []
    };
  }

  const need = admit(
    stateNeed(scenario, evidenceRef),
    baselineId,
    scenario,
    now
  );

  const allocation = allocateNextResponsibility({
    needs: [need],
    candidates: teamCandidates,
    existingResponsibilities: [],
    satisfiedNeedIds: [],
    teamNeeds: [],
    needSelectionOptions: {
      weights: config.needSelectionWeights
    },
    matcherOptions,
    authorityForNeed: () => ({
      investigate: true,
      propose: true,
      execute: true,
      requestHelp: true,
      mutateScopes: ["implementation"]
    }),
    leaseForNeed: () => lease(now)
  });

  if (allocation.status !== "assigned") {
    throw new TypeError(
      `P allocation failed: ${allocation.status}`
    );
  }

  const started = startResponsibility({
    need: allocation.assignment.need,
    responsibility: allocation.assignment.responsibility,
    acceptedAt: now,
    activatedAt: now
  });

  return {
    schemaVersion: 1,
    baselineId,
    ontologyType: "state_derived_need",
    selectedRoleId: null,
    roleDecision,
    needDecision: allocation.needDecision,
    assignmentDecision: allocation.assignment.decision,
    need: started.need,
    responsibility: started.responsibility,
    selectedWorkerId: started.responsibility.assigneeId,
    contextKinds:
      workers.get(started.responsibility.assigneeId)?.contextKinds ?? []
  };
}
