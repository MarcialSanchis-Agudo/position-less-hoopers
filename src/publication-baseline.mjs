import {
  admitNeedProposal
} from "./need.mjs";
import {
  assignNeed,
  startResponsibility
} from "./cycle.mjs";
import {
  allocateNextResponsibility
} from "./allocator.mjs";

export const PUBLICATION_BASELINE_IDS = Object.freeze([
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

function selectWorkers(config, ids) {
  const byId = workerMap(config);
  return ids.map((id) => {
    const worker = byId.get(id);
    if (!worker) throw new TypeError(`Unknown publication worker: ${id}`);
    return worker;
  });
}

function phaseRole(config, phaseKind) {
  const roleId = config.phaseRoleMap?.[phaseKind];
  if (!roleId) {
    throw new TypeError(`No predefined role for phase ${phaseKind}`);
  }
  const role = config.predefinedRoles?.[roleId];
  if (!role) {
    throw new TypeError(`Unknown predefined role: ${roleId}`);
  }
  return { roleId, role };
}

export function classifyPublicationScenario(scenario) {
  if (!scenario || typeof scenario !== "object") {
    throw new TypeError("scenario is required");
  }

  if (scenario.kind === "clean") {
    return {
      scenarioClass: "clean",
      phaseKind: "clean_implementation"
    };
  }

  const type = scenario.perturbation?.type;
  if (type === "contract_reveal" || type === "external_contract_mutation") {
    return {
      scenarioClass: type,
      phaseKind: "contract_change"
    };
  }

  if (type === "workspace_regression") {
    return {
      scenarioClass: "workspace_regression",
      phaseKind: "implementation_regression"
    };
  }

  if (type === "worker_loss") {
    return {
      scenarioClass: "worker_loss",
      phaseKind: "worker_loss"
    };
  }

  throw new TypeError(`Unsupported publication scenario type: ${type}`);
}

function stateDerivedSpec(phaseKind) {
  if (phaseKind === "clean_implementation") {
    return {
      objective: "Bring the implementation into compliance with the active contract.",
      rationale: "The active contract is authoritative and the current seed implementation does not yet satisfy it.",
      requiredCapabilities: ["implement"],
      contextRefs: ["contract", "implementation"]
    };
  }

  if (phaseKind === "contract_change") {
    return {
      objective: "Adapt the implementation to the newly authoritative contract state.",
      rationale: "The active contract changed after the previously correct state and authoritative grading now fails.",
      requiredCapabilities: ["implement"],
      contextRefs: ["contract"]
    };
  }

  if (phaseKind === "implementation_regression") {
    return {
      objective: "Repair the implementation regression while preserving the unchanged active contract.",
      rationale: "Authoritative grading regressed while the contract version remained unchanged, so the unmet Need is implementation-local.",
      requiredCapabilities: ["implement"],
      contextRefs: ["implementation"]
    };
  }

  throw new TypeError(`No state-derived Need for phase ${phaseKind}`);
}

function baselineSpec({ baselineId, phaseKind, config }) {
  const specialists = config.specialistPoolIds ?? [];

  if (baselineId === "B0") {
    return {
      ontologyType: "single_generalist",
      predefinedRoleId: null,
      objective: "Solve the current TaskPack state as one strong generalist executor.",
      rationale: "B0 uses one fixed strong agent with bounded context for both the implementation and active contract.",
      requiredCapabilities: ["implement"],
      contextRefs: ["contract", "implementation"],
      candidateIds: [config.strongSingleAgentId],
      matcherOptions: { mode: "static" },
      staticPreference: [config.strongSingleAgentId]
    };
  }

  if (baselineId === "B1") {
    return {
      ontologyType: "static_workflow",
      predefinedRoleId: "fixed_implementation_owner",
      objective: "Execute the fixed implementation-owner workflow against the current task state.",
      rationale: "B1 never changes responsibility ownership in response to state changes.",
      requiredCapabilities: ["implement"],
      contextRefs: ["implementation"],
      candidateIds: [config.staticWorkflowWorkerId],
      matcherOptions: { mode: "static" },
      staticPreference: [config.staticWorkflowWorkerId]
    };
  }

  if (baselineId === "B2") {
    const { roleId, role } = phaseRole(config, phaseKind);
    const owner = config.fixedRoleOwners?.[roleId];
    if (!owner) throw new TypeError(`No fixed owner for role ${roleId}`);
    return {
      ontologyType: "fixed_specialist_roles",
      predefinedRoleId: roleId,
      objective: role.objective,
      rationale: `B2 uses the frozen ${roleId} role with its persistent owner.`,
      requiredCapabilities: role.requiredCapabilities ?? [],
      contextRefs: role.contextRefs ?? [],
      candidateIds: [owner],
      matcherOptions: { mode: "static" },
      staticPreference: [owner]
    };
  }

  if (baselineId === "B3") {
    const { roleId, role } = phaseRole(config, phaseKind);
    return {
      ontologyType: "dynamic_predefined_roles",
      predefinedRoleId: roleId,
      objective: role.objective,
      rationale: `B3 dynamically assigns the frozen ${roleId} role but cannot change the role ontology.`,
      requiredCapabilities: role.requiredCapabilities ?? [],
      contextRefs: role.contextRefs ?? [],
      candidateIds: specialists,
      matcherOptions: config.matcherOptions ?? { mode: "capability_situated" },
      staticPreference: []
    };
  }

  if (baselineId === "P") {
    const stateNeed = stateDerivedSpec(phaseKind);
    return {
      ontologyType: "state_derived_need",
      predefinedRoleId: null,
      ...stateNeed,
      candidateIds: specialists,
      matcherOptions: config.matcherOptions ?? { mode: "capability_situated" },
      staticPreference: []
    };
  }

  throw new TypeError(`Unknown publication baseline: ${baselineId}`);
}

function makeProposal({
  taskPackId,
  scenarioId,
  contractVersion,
  baselineId,
  phaseKind,
  evidenceRef,
  spec
}) {
  return {
    goalId: `goal:publication:${taskPackId}:${scenarioId}`,
    objective: spec.objective,
    rationale: spec.rationale,
    stateVersion:
      `${taskPackId}:${scenarioId}:contract-v${contractVersion}:${phaseKind}`,
    requirements: {
      capabilities: spec.requiredCapabilities,
      permissions: ["workspace-write"],
      contextRefs: spec.contextRefs
    },
    coverage: {
      targetRefs: ["active-contract", "implementation"],
      evidenceTypes: ["external-grader"],
      mutationScopes: ["implementation"]
    },
    urgency: 1,
    importance: 1,
    uncertainty: 0.4,
    risk: 0.7,
    expectedInformationGain: 0.5,
    redundancyPolicy: "exclusive",
    evidenceObligations: [evidenceRef],
    exitConditions: [evidenceRef],
    createdBy: baselineId === "P"
      ? "deterministic_signal"
      : "orchestrator_judgment"
  };
}

function lease(now) {
  const t = Date.parse(now);
  return {
    offeredAt: now,
    renewAfter: new Date(t + 5 * 60000).toISOString(),
    expiresAt: new Date(t + 30 * 60000).toISOString()
  };
}

export function planPublicationResponsibility({
  baselineId,
  phaseKind,
  taskPackId,
  scenarioId,
  contractVersion,
  evidenceRef,
  config,
  now = new Date().toISOString()
}) {
  if (!PUBLICATION_BASELINE_IDS.includes(baselineId)) {
    throw new TypeError(`Unsupported publication baseline: ${baselineId}`);
  }

  const spec = baselineSpec({ baselineId, phaseKind, config });
  const admission = admitNeedProposal(
    makeProposal({
      taskPackId,
      scenarioId,
      contractVersion,
      baselineId,
      phaseKind,
      evidenceRef,
      spec
    }),
    [],
    {
      id: `need:publication:${taskPackId}:${scenarioId}:${baselineId}`,
      now
    }
  );

  if (admission.status !== "admitted") {
    throw new TypeError(
      `Publication Need admission failed: ${admission.reason}`
    );
  }

  const candidates = selectWorkers(config, spec.candidateIds);
  const leaseWindow = lease(now);
  let assignment;
  let needDecision = null;

  if (baselineId === "P") {
    const allocation = allocateNextResponsibility({
      needs: [admission.need],
      candidates,
      teamNeeds: [],
      existingResponsibilities: [],
      satisfiedNeedIds: [],
      needSelectionOptions: {
        weights: config.needSelectionWeights
      },
      matcherOptions: spec.matcherOptions,
      authorityForNeed: () => ({
        investigate: true,
        propose: true,
        execute: true,
        requestHelp: true,
        mutateScopes: ["implementation"]
      }),
      leaseForNeed: () => leaseWindow
    });
    if (allocation.status !== "assigned") {
      throw new TypeError(`P allocation failed: ${allocation.status}`);
    }
    needDecision = allocation.needDecision;
    assignment = allocation.assignment;
  } else {
    assignment = assignNeed({
      need: admission.need,
      candidates,
      matcherOptions: spec.matcherOptions,
      staticPreference: spec.staticPreference,
      assignmentVersion: 1,
      authority: {
        investigate: true,
        propose: true,
        execute: true,
        requestHelp: true,
        mutateScopes: ["implementation"]
      },
      ...leaseWindow
    });
    if (assignment.status !== "assigned") {
      throw new TypeError(
        `${baselineId} assignment failed: ${assignment.status}`
      );
    }
  }

  const started = startResponsibility({
    need: assignment.need,
    responsibility: assignment.responsibility,
    acceptedAt: now,
    activatedAt: now
  });

  const selectedWorker = workerMap(config).get(
    started.responsibility.assigneeId
  );
  if (!selectedWorker) {
    throw new TypeError("Selected publication worker is missing");
  }

  return {
    schemaVersion: 1,
    baselineId,
    phaseKind,
    ontologyType: spec.ontologyType,
    predefinedRoleId: spec.predefinedRoleId,
    needDecision,
    assignmentDecision: assignment.decision,
    need: started.need,
    responsibility: started.responsibility,
    selectedWorkerId: selectedWorker.id,
    contextKinds: [...(selectedWorker.contextKinds ?? [])]
  };
}
