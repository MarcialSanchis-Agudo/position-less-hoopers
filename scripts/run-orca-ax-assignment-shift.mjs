import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  admitRegionNeed,
  allocateRegionNext,
  createAdaptiveRegion,
  createExecutionRequest,
  createPolicyState,
  finishRegionResponsibility,
  normalizeTaskPackManifest,
  observePolicyEvent,
  runCommandAgent,
  startRegionResponsibility
} from "../src/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const configArg = process.argv[2];
const outArg = process.argv[3];
const adapterArg = process.argv[4];
const matcherModeArg = process.argv[5] ?? null;

if (!configArg || !outArg || !adapterArg) {
  process.stderr.write(
    "usage: node run-orca-ax-assignment-shift.mjs <config.json> <outDir> <adapter.json> [matcherMode]\n"
  );
  process.exit(2);
}

const configPath = path.resolve(root, configArg);
const outRoot = path.resolve(root, outArg);
const relativeOut = path.relative(root, outRoot);
if (!relativeOut || relativeOut.startsWith("..") || path.isAbsolute(relativeOut)) {
  throw new Error("output directory must stay inside repository");
}

const config = JSON.parse(await fs.readFile(configPath, "utf8"));
const matcherMode = matcherModeArg ?? config.matcherMode;
if (!matcherMode) {
  throw new Error("ORCA AX config requires matcherMode or CLI matcherMode");
}
const taskPackPath = path.resolve(root, config.taskPack);
const packRoot = path.dirname(taskPackPath);
const manifest = normalizeTaskPackManifest(
  JSON.parse(await fs.readFile(taskPackPath, "utf8"))
);
const stream = JSON.parse(
  await fs.readFile(path.resolve(root, config.eventStream), "utf8")
);
const adapterPath = path.resolve(root, adapterArg);
const adapterDir = path.dirname(adapterPath);
const adapter = JSON.parse(await fs.readFile(adapterPath, "utf8"));
adapter.args = (adapter.args ?? []).map((arg) =>
  arg.startsWith("./") || arg.startsWith("../")
    ? path.resolve(adapterDir, arg)
    : arg
);

if (manifest.taskPackId !== config.taskPackId || stream.taskPackId !== config.taskPackId) {
  throw new Error("ORCA AX config TaskPack mismatch");
}

async function copyDir(source, destination) {
  await fs.mkdir(destination, { recursive: true });
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    const src = path.join(source, entry.name);
    const dst = path.join(destination, entry.name);
    if (entry.isDirectory()) await copyDir(src, dst);
    else await fs.copyFile(src, dst);
  }
}

function resolveInside(base, relativePath, label) {
  const resolved = path.resolve(base, relativePath);
  const relative = path.relative(base, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} must stay inside its declared root`);
  }
  return resolved;
}

function evidenceRef(version) {
  return manifest.evidenceRefTemplate.replace("{version}", String(version));
}

function gradeVersion(workspace, version) {
  const grader = path.join(packRoot, manifest.grader.path);
  const result = spawnSync(
    process.execPath,
    [grader, workspace, String(version)],
    { cwd: root, encoding: "utf8" }
  );

  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    parsed = {
      schemaVersion: 1,
      contractVersion: version,
      correct: false,
      evidenceRefs: [],
      rawStdout: result.stdout,
      rawStderr: result.stderr
    };
  }

  return {
    ...parsed,
    graderExitCode: result.status
  };
}

function gradeSatisfies(version, grade) {
  return (
    grade.correct === true &&
    (grade.evidenceRefs ?? []).includes(evidenceRef(version))
  );
}

async function revealContract(workspace, version) {
  const rel = manifest.contracts[String(version)];
  if (!rel) throw new Error(`No contract v${version} in TaskPack`);
  const destination = path.join(workspace, manifest.activeContractPath);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(path.join(packRoot, rel), destination);
}

async function applyWorkspaceMutation(workspace, mutation) {
  if (!mutation) return;
  if (mutation.type === "reveal_contract") {
    await revealContract(workspace, mutation.contractVersion);
    return;
  }
  if (mutation.type === "copy_taskpack_file") {
    const source = resolveInside(packRoot, mutation.source, "workspaceMutation.source");
    const destination = resolveInside(
      workspace,
      mutation.destination,
      "workspaceMutation.destination"
    );
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
    return;
  }
  throw new Error(`Unsupported workspace mutation: ${mutation.type}`);
}

function isoAt(tMs) {
  return new Date(Date.parse("2026-10-05T08:00:00.000Z") + tMs).toISOString();
}

function leaseAt(tMs) {
  const offeredAt = isoAt(tMs);
  return {
    offeredAt,
    renewAfter: new Date(Date.parse(offeredAt) + 5 * 60000).toISOString(),
    expiresAt: new Date(Date.parse(offeredAt) + 30 * 60000).toISOString()
  };
}

function needProposal(episode) {
  const expectedEvidence = evidenceRef(stream.targetContractVersion);
  return {
    goalId: config.region.goalId,
    objective: episode.objective,
    rationale: episode.rationale,
    stateVersion: episode.stateVersion,
    requirements: {
      capabilities: ["implement"],
      permissions: ["workspace-write"],
      contextRefs: episode.contextRefs
    },
    coverage: {
      targetRefs: ["src/rollout.mjs", "contract/rollout.json"],
      evidenceTypes: ["external-grader"],
      mutationScopes: ["src/rollout.mjs"]
    },
    urgency: 1,
    importance: 1,
    uncertainty: 0.4,
    risk: 0.7,
    expectedInformationGain: 0.5,
    redundancyPolicy: "exclusive",
    evidenceObligations: [expectedEvidence],
    exitConditions: [expectedEvidence],
    createdBy: "deterministic_signal"
  };
}

await fs.rm(outRoot, { recursive: true, force: true });
await fs.mkdir(outRoot, { recursive: true });

const workspace = path.join(outRoot, "workspace");
await copyDir(path.join(packRoot, manifest.seedPath), workspace);
await revealContract(workspace, stream.initialContractVersion);

const taskInstruction = await fs.readFile(
  path.join(workspace, "TASK.md"),
  "utf8"
);

const initialGrade = gradeVersion(workspace, stream.initialContractVersion);
if (!initialGrade.correct) {
  throw new Error("initial workspace does not satisfy initial contract");
}

let region = createAdaptiveRegion({
  ...config.region,
  enteredAt: isoAt(0)
});
const policyState = createPolicyState(config.policy, {
  pressureField: stream.pressureField
});

const episodeByTrigger = new Map(
  config.episodes.map((episode) => [episode.triggerEventId, episode])
);
const assignments = [];
const executions = [];
const suppressedExecutions = [];
const reevaluations = [];
let targetRevealedAtMs = null;

for (const event of stream.events) {
  if (event.workspaceMutation) {
    await applyWorkspaceMutation(workspace, event.workspaceMutation);
    if (
      event.workspaceMutation.type === "reveal_contract" &&
      targetRevealedAtMs == null
    ) {
      targetRevealedAtMs = event.tMs;
    }
  }

  const observed = observePolicyEvent(policyState, event);
  if (!observed.decision.shouldRecompute) continue;

  const currentContract = JSON.parse(
    await fs.readFile(path.join(workspace, manifest.activeContractPath), "utf8")
  );
  const preGrade = gradeVersion(workspace, currentContract.contractVersion);
  const alreadySatisfied =
    currentContract.contractVersion === stream.targetContractVersion &&
    gradeSatisfies(currentContract.contractVersion, preGrade);

  reevaluations.push({
    eventId: event.eventId,
    tMs: event.tMs,
    reason: observed.decision.reason,
    authoritativeCorrectBeforeAction: alreadySatisfied
  });

  if (alreadySatisfied) {
    suppressedExecutions.push({
      eventId: event.eventId,
      tMs: event.tMs,
      reason: "authoritative_target_already_satisfied"
    });
    continue;
  }

  const episode = episodeByTrigger.get(event.eventId);
  if (!episode) {
    throw new Error(
      `Unsatisfied reevaluation ${event.eventId} has no frozen ORCA AX episode`
    );
  }

  const admitted = admitRegionNeed(region, needProposal(episode), {
    id: episode.needId,
    now: isoAt(event.tMs)
  });
  if (admitted.admission.status !== "admitted") {
    throw new Error(
      `Need admission failed at ${event.eventId}: ${admitted.admission.status}`
    );
  }
  region = admitted.region;

  const allocation = allocateRegionNext(region, {
    candidates: episode.candidates,
    satisfiedNeedIds: region.needs
      .filter((need) => need.status === "satisfied")
      .map((need) => need.id),
    matcherOptions: { mode: matcherMode },
    authorityForNeed: () => ({
      investigate: true,
      propose: true,
      execute: true,
      requestHelp: true,
      mutateScopes: ["src/rollout.mjs"]
    }),
    leaseForNeed: () => leaseAt(event.tMs)
  });
  if (allocation.allocation.status !== "assigned") {
    throw new Error(
      `Allocation failed at ${event.eventId}: ${allocation.allocation.status}`
    );
  }
  region = allocation.region;

  const responsibility = allocation.allocation.assignment.responsibility;
  const selectedNeed = allocation.allocation.assignment.need;
  const predictedAssigneeId =
    episode.predictedAssigneeByMatcherMode?.[matcherMode] ??
    episode.predictedAssigneeId ??
    null;
  const selectedSituatedness =
    allocation.allocation.assignment.decision?.selectedScore?.situatedness ??
    null;
  const contextAligned =
    selectedSituatedness == null ? null : selectedSituatedness >= 1;

  assignments.push({
    eventId: event.eventId,
    needId: selectedNeed.id,
    assigneeId: responsibility.assigneeId,
    predictedAssigneeId,
    contextAligned,
    selectedSituatedness,
    matcherDecision: allocation.allocation.assignment.decision
  });

  const started = startRegionResponsibility(region, {
    responsibilityId: responsibility.id,
    acceptedAt: isoAt(event.tMs + 1000),
    activatedAt: isoAt(event.tMs + 2000)
  });
  region = started.region;

  const activeResponsibility = started.started.responsibility;
  const activeNeed = started.started.need;
  const workerContextRel =
    config.workerContextPackages?.[activeResponsibility.assigneeId] ?? null;
  const workerContextPath = path.join(workspace, "PLH_CONTEXT.md");

  if (workerContextRel) {
    const workerContextSource = resolveInside(
      root,
      workerContextRel,
      "workerContextPackages"
    );
    await fs.copyFile(workerContextSource, workerContextPath);
  } else {
    await fs.rm(workerContextPath, { force: true });
  }

  const taskInstructionForWorker = workerContextRel
    ? taskInstruction.trim() +
      "\n\nBefore solving, read PLH_CONTEXT.md. It is bounded prior context for the selected worker; the active contract remains authoritative."
    : taskInstruction;

  const request = createExecutionRequest({
    region,
    need: activeNeed,
    responsibility: activeResponsibility,
    workspace,
    taskInstruction: taskInstructionForWorker,
    expectedEvidenceRefs: activeNeed.evidenceObligations,
    metadata: {
      taskPackId: manifest.taskPackId,
      scenarioId: config.scenarioId,
      policy: config.policy,
      matcherMode,
      triggerEventId: event.eventId,
      candidateAssigneeId: activeResponsibility.assigneeId,
      workerContextPackage: workerContextRel,
      adapterId: adapter.adapterId
    }
  });

  const executionRoot = path.join(
    outRoot,
    "executions",
    String(executions.length + 1).padStart(2, "0") + "-" + event.eventId
  );
  const execution = await runCommandAgent(request, adapter, {
    runRoot: executionRoot
  });
  await fs.rm(workerContextPath, { force: true });

  const postGrade = gradeVersion(workspace, stream.targetContractVersion);
  const authoritativeEvidence = postGrade.correct
    ? postGrade.evidenceRefs ?? []
    : [];

  const finished = finishRegionResponsibility(region, {
    responsibilityId: activeResponsibility.id,
    completedAt: isoAt(event.tMs + 3000),
    evidenceRefs: authoritativeEvidence
  });
  region = finished.region;

  executions.push({
    eventId: event.eventId,
    needId: activeNeed.id,
    assigneeId: activeResponsibility.assigneeId,
    responsibilityId: activeResponsibility.id,
    workerContextPackage: workerContextRel,
    contextAligned,
    executionStatus: execution.result.status,
    executionDurationMs: execution.telemetry.durationMs,
    externalCorrect: postGrade.correct,
    evidenceSatisfied: gradeSatisfies(stream.targetContractVersion, postGrade),
    finishStatus: finished.finished.status
  });
}

const finalGrade = gradeVersion(workspace, stream.targetContractVersion);
const satisfiedNeeds = region.needs.filter((need) => need.status === "satisfied");
const totalAgentExecutionMs = executions.reduce(
  (sum, execution) => sum + execution.executionDurationMs,
  0
);
const firstRecoveryAgentExecutionMs =
  executions.find((execution) => execution.eventId === "corroborated-rollout-risk")
    ?.executionDurationMs ?? null;
const contextMisalignedAssignmentCount = assignments.filter(
  (assignment) => assignment.contextAligned === false
).length;
const predictedAssignmentSequence =
  config.predictionsByMatcherMode?.[matcherMode]?.assignmentSequence ??
  config.predictions?.assignmentSequence ??
  null;

const summary = {
  schemaVersion: 1,
  experimentId: config.experimentId,
  policy: config.policy,
  matcherMode,
  assignmentSequence: assignments.map((item) => item.assigneeId),
  predictedAssignmentSequence,
  contextMisalignedAssignmentCount,
  needCount: region.needs.length,
  satisfiedNeedCount: satisfiedNeeds.length,
  policyRecomputationCount: policyState.recomputationCount,
  agentInvocationCount: executions.length,
  suppressedExecutionCount: suppressedExecutions.length,
  firstRecoveryAgentExecutionMs,
  totalAgentExecutionMs,
  targetRevealedAtMs,
  finalCorrect: finalGrade.correct,
  evidenceSatisfied: gradeSatisfies(stream.targetContractVersion, finalGrade),
  assignments,
  reevaluations,
  executions,
  suppressedExecutions,
  region: {
    id: region.id,
    status: region.status,
    needs: region.needs,
    responsibilities: region.responsibilities,
    evidenceRefs: region.evidenceRefs
  },
  finalGrade
};

await fs.writeFile(
  path.join(outRoot, "orca-ax-assignment-shift-summary.json"),
  JSON.stringify(summary, null, 2) + "\n"
);

process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
