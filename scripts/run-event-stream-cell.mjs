import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  createExperimentCellExecution,
  createPolicyState,
  observePolicyEvent,
  normalizeTaskPackManifest
} from "../src/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const runRootArg = process.argv[2];
const adapterConfigArg = process.argv[3];
const eventStreamArg = process.argv[4];

if (!runRootArg || !adapterConfigArg || !eventStreamArg) {
  process.stderr.write(
    "usage: node run-event-stream-cell.mjs <runRoot> <adapter.json> <event-stream.json>\n"
  );
  process.exit(2);
}

const runRoot = path.resolve(root, runRootArg);
const adapterPath = path.resolve(root, adapterConfigArg);
const streamPath = path.resolve(root, eventStreamArg);

const meta = JSON.parse(
  await fs.readFile(path.join(runRoot, "run-meta.json"), "utf8")
);
const stream = JSON.parse(await fs.readFile(streamPath, "utf8"));
const manifestPath = path.resolve(root, meta.manifestPath);
const packRoot = path.dirname(manifestPath);
const manifest = normalizeTaskPackManifest(
  JSON.parse(await fs.readFile(manifestPath, "utf8"))
);

if (stream.taskPackId !== meta.taskPackId) {
  throw new Error("event stream TaskPack mismatch");
}

const adapter = JSON.parse(await fs.readFile(adapterPath, "utf8"));
const adapterDir = path.dirname(adapterPath);
adapter.args = (adapter.args ?? []).map((arg) =>
  arg.startsWith("./") || arg.startsWith("../")
    ? path.resolve(adapterDir, arg)
    : arg
);

const workspace = path.join(runRoot, "workspace");
const taskInstruction = await fs.readFile(
  path.join(workspace, "TASK.md"),
  "utf8"
);

function evidenceRef(version) {
  return manifest.evidenceRefTemplate.replace("{version}", String(version));
}

function gradeVersion(version) {
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
      parseError: true,
      rawStdout: result.stdout,
      rawStderr: result.stderr
    };
  }

  return {
    ...parsed,
    graderExitCode: result.status
  };
}

async function revealContract(version) {
  const rel = manifest.contracts[String(version)];
  if (!rel) {
    throw new Error(`No contract v${version} in TaskPack`);
  }
  await fs.copyFile(
    path.join(packRoot, rel),
    path.join(workspace, manifest.activeContractPath)
  );
}

function resolveInside(base, relativePath, label) {
  const resolved = path.resolve(base, relativePath);
  const relative = path.relative(base, resolved);
  if (
    !relative ||
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`${label} must stay inside its declared root`);
  }
  return resolved;
}

function gradeSatisfies(version, grade) {
  return (
    grade.correct === true &&
    (grade.evidenceRefs ?? []).includes(evidenceRef(version))
  );
}

async function applyWorkspaceMutation(mutation) {
  if (!mutation) return;

  if (mutation.type === "reveal_contract") {
    await revealContract(mutation.contractVersion);
    return;
  }

  if (mutation.type === "copy_taskpack_file") {
    const source = resolveInside(
      packRoot,
      mutation.source,
      "workspaceMutation.source"
    );
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

const initialGrade = gradeVersion(stream.initialContractVersion);
if (!initialGrade.correct) {
  throw new Error("initial workspace does not satisfy initial contract");
}

const policyState = createPolicyState(meta.policy, {
  pressureField: stream.pressureField
});

const decisions = [];
const invocations = [];
const suppressedExecutions = [];
let targetRevealedAtMs = null;
let recoverySucceededAtMs = null;
let invocationIndex = 0;

for (const event of stream.events) {
  if (event.workspaceMutation) {
    await applyWorkspaceMutation(event.workspaceMutation);
    if (
      event.workspaceMutation.type === "reveal_contract" &&
      targetRevealedAtMs == null
    ) {
      targetRevealedAtMs = event.tMs;
    }
  }

  const observed = observePolicyEvent(policyState, event);
  decisions.push(observed.decision);

  if (!observed.decision.shouldRecompute) {
    continue;
  }

  const currentContract = JSON.parse(
    await fs.readFile(
      path.join(workspace, manifest.activeContractPath),
      "utf8"
    )
  );

  const preExecutionGrade = gradeVersion(currentContract.contractVersion);

  if (
    meta.policy === "plh_hybrid_guarded" &&
    targetRevealedAtMs != null &&
    currentContract.contractVersion === stream.targetContractVersion &&
    gradeSatisfies(currentContract.contractVersion, preExecutionGrade)
  ) {
    suppressedExecutions.push({
      eventId: event.eventId,
      tMs: event.tMs,
      contractVersion: currentContract.contractVersion,
      reason: "authoritative_target_already_satisfied"
    });
    continue;
  }

  invocationIndex += 1;
  const phaseRoot = path.join(
    runRoot,
    "event-invocations",
    String(invocationIndex).padStart(2, "0") + "-" + event.eventId
  );

  const execution = await createExperimentCellExecution({
    runRoot: phaseRoot,
    meta,
    workspace,
    adapter,
    taskInstruction,
    evidenceRef: evidenceRef(currentContract.contractVersion),
    contractVersion: currentContract.contractVersion,
    assignmentVersion: invocationIndex,
    phase: `event:${event.eventId}`
  });

  const grade = gradeVersion(currentContract.contractVersion);

  invocations.push({
    eventId: event.eventId,
    tMs: event.tMs,
    contractVersion: currentContract.contractVersion,
    preExecutionCorrect: gradeSatisfies(
      currentContract.contractVersion,
      preExecutionGrade
    ),
    executionStatus: execution.result.status,
    executionDurationMs: execution.telemetry.durationMs,
    gradeCorrect: grade.correct
  });

  if (
    currentContract.contractVersion === stream.targetContractVersion &&
    grade.correct &&
    recoverySucceededAtMs == null
  ) {
    recoverySucceededAtMs = event.tMs;
  }
}

const finalGrade = gradeVersion(stream.targetContractVersion);

const usefulInvocations = invocations.filter((row) =>
  row.contractVersion === stream.targetContractVersion &&
  row.gradeCorrect
);

const firstRecoveryIndex = invocations.findIndex((row) =>
  row.contractVersion === stream.targetContractVersion &&
  row.gradeCorrect
);

const prePerturbationInvocations = invocations.filter((row) =>
  row.contractVersion === stream.initialContractVersion
);

const recoveryAttempts = invocations.filter((row) =>
  row.contractVersion === stream.targetContractVersion &&
  row.preExecutionCorrect === false
);

const postRecoveryInvocations = firstRecoveryIndex === -1
  ? []
  : invocations.slice(firstRecoveryIndex + 1);

const redundantInvocations = [
  ...prePerturbationInvocations,
  ...postRecoveryInvocations.filter((row) => row.preExecutionCorrect === true)
];

const sumDuration = (rows) => rows.reduce(
  (sum, row) => sum + (row.executionDurationMs ?? 0),
  0
);

const result = {
  schemaVersion: 1,
  taskPackId: meta.taskPackId,
  scenarioId: meta.scenarioId,
  policy: meta.policy,
  streamId: stream.streamId,
  initialCorrect: initialGrade.correct,
  targetRevealedAtMs,
  policyRecomputationCount: policyState.recomputationCount,
  agentInvocationCount: invocations.length,
  prePerturbationInvocationCount: prePerturbationInvocations.length,
  recoveryAttemptCount: recoveryAttempts.length,
  postRecoveryInvocationCount: postRecoveryInvocations.length,
  redundantInvocationCount: redundantInvocations.length,
  suppressedExecutionCount: suppressedExecutions.length,
  prePerturbationAgentExecutionMs: sumDuration(prePerturbationInvocations),
  recoveryAttemptAgentExecutionMs: sumDuration(recoveryAttempts),
  postRecoveryAgentExecutionMs: sumDuration(postRecoveryInvocations),
  redundantAgentExecutionMs: sumDuration(redundantInvocations),
  unnecessaryInvocationCount: prePerturbationInvocations.length,
  recoveryTriggerEventId:
    usefulInvocations[0]?.eventId ?? null,
  recoveryTriggerLatencyMs:
    targetRevealedAtMs != null && recoverySucceededAtMs != null
      ? recoverySucceededAtMs - targetRevealedAtMs
      : null,
  finalCorrect: finalGrade.correct,
  evidenceSatisfied:
    finalGrade.correct === true &&
    (finalGrade.evidenceRefs ?? []).includes(
      evidenceRef(stream.targetContractVersion)
    ),
  decisions,
  invocations,
  suppressedExecutions,
  finalGrade
};

await fs.writeFile(
  path.join(runRoot, "event-stream-result.json"),
  JSON.stringify(result, null, 2) + "\n"
);

process.stdout.write(JSON.stringify(result, null, 2) + "\n");
process.exit(0);

