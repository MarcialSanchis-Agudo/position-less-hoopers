import fs from "node:fs/promises";
import path from "node:path";
import {
  createExecutionRequest
} from "./runner-port.mjs";
import {
  runCommandAgent
} from "./command-agent.mjs";

function isoAfter(base, minutes) {
  return new Date(Date.parse(base) + minutes * 60000).toISOString();
}

export function finalizeExperimentCell({
  execution,
  grade,
  meta
}) {
  if (!execution || !grade || !meta) {
    throw new TypeError("finalizeExperimentCell requires execution, grade, and meta");
  }

  const authoritativeEvidenceRefs =
    grade.correct === true && Array.isArray(grade.evidenceRefs)
      ? [...new Set(grade.evidenceRefs)].sort()
      : [];

  return {
    schemaVersion: 1,
    taskPackId: meta.taskPackId,
    scenarioId: meta.scenarioId,
    policy: meta.policy,
    adapterId:
      execution.telemetry.adapterId ??
      execution.request.responsibility.assigneeId,
    executionStatus: execution.result.status,
    externalCorrect: grade.correct === true,
    agentReportedEvidenceRefs: Array.isArray(execution.result.evidenceRefs)
      ? [...new Set(execution.result.evidenceRefs)].sort()
      : [],
    authoritativeEvidenceRefs,
    evidenceSatisfied: execution.request.expectedEvidenceRefs.every(
      (ref) => authoritativeEvidenceRefs.includes(ref)
    ),
    graderExitCode: grade.graderExitCode ?? null,
    executionDurationMs: execution.telemetry.durationMs,
    executionExitCode: execution.telemetry.exitCode,
    grade
  };
}

export async function createExperimentCellExecution({
  runRoot,
  meta,
  workspace,
  adapter,
  taskInstruction,
  evidenceRef,
  execute = runCommandAgent,
  startedAt = new Date().toISOString(),
  contractVersion = meta.initialContractVersion,
  assignmentVersion = 1,
  phase = "primary"
}) {
  const region = {
    id: `region:${meta.taskPackId}:${meta.scenarioId}`,
    goalId: `goal:${meta.taskPackId}:${meta.scenarioId}`,
    stateVersion: `contract-v${contractVersion}`
  };

  const need = {
    id: `need:${meta.taskPackId}:${meta.scenarioId}:v${contractVersion}`,
    objective: taskInstruction,
    rationale:
      `Solve TaskPack ${meta.taskPackId} scenario ${meta.scenarioId}`,
    requirements: {
      capabilities: ["implement"],
      toolAccess: [],
      permissions: ["workspace-write"],
      workspaceAccess: [workspace],
      contextRefs: []
    },
    coverage: {
      targetRefs: ["workspace"],
      hypothesisRefs: [],
      evidenceTypes: ["external-grader"],
      mutationScopes: ["workspace"]
    },
    evidenceObligations: [evidenceRef],
    exitConditions: [evidenceRef]
  };

  const responsibility = {
    id:
      `responsibility:${meta.taskPackId}:${meta.scenarioId}:v${contractVersion}:a${assignmentVersion}`,
    needId: need.id,
    assigneeId: adapter.adapterId,
    assignmentVersion,
    authority: {
      investigate: true,
      propose: true,
      execute: true,
      requestHelp: true,
      mutateScopes: ["workspace"]
    },
    evidenceObligations: [evidenceRef],
    expiresAt: isoAfter(startedAt, 30)
  };

  const request = createExecutionRequest({
    region,
    need,
    responsibility,
    workspace,
    taskInstruction,
    expectedEvidenceRefs: [evidenceRef],
    metadata: {
      taskPackId: meta.taskPackId,
      scenarioId: meta.scenarioId,
      policy: meta.policy,
      targetContractVersion: meta.targetContractVersion,
      contractVersion,
      phase
    }
  });

  const run = await execute(request, adapter, { runRoot });

  await fs.mkdir(runRoot, { recursive: true });
  await fs.writeFile(
    path.join(runRoot, "execution-envelope.json"),
    JSON.stringify(run, null, 2) + "\n"
  );

  return run;
}

