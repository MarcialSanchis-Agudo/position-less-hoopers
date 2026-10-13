import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  createExecutionRequest,
  planOntologyStressResponsibility,
  runCommandAgent
} from "../src/index.mjs";
import {
  deriveEvidenceFeedback,
  renderEvidenceFeedback
} from "../src/evidence-feedback.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const manifestArg = process.argv[2];
const scenarioIdArg = process.argv[3];
const ontologyArg = process.argv[4];
const evalSetArg = process.argv[5];
const baselineId = process.argv[6];
const outArg = process.argv[7];
const adapterArg = process.argv[8];

if (
  !manifestArg ||
  !scenarioIdArg ||
  !ontologyArg ||
  !evalSetArg ||
  !baselineId ||
  !outArg ||
  !adapterArg
) {
  process.stderr.write(
    "usage: node run-local-evidence-loop-cell-v0.1.mjs <task-pack.json> <scenarioId> <ontology.json> <eval-set.json> <baselineId> <outDir> <adapter.json>\n"
  );
  process.exit(2);
}

const manifestPath = path.resolve(root, manifestArg);
const packRoot = path.dirname(manifestPath);
const manifest = JSON.parse(
  await fs.readFile(manifestPath, "utf8")
);
const config = JSON.parse(
  await fs.readFile(path.resolve(root, ontologyArg), "utf8")
);
const evalSet = JSON.parse(
  await fs.readFile(path.resolve(root, evalSetArg), "utf8")
);
const taskProfile = evalSet.taskProfiles?.[manifest.taskPackId];
if (!taskProfile) {
  throw new Error(
    `No task profile for ${manifest.taskPackId}`
  );
}

const feedbackConfig = JSON.parse(
  await fs.readFile(
    path.resolve(root, evalSet.evidenceFeedbackConfig),
    "utf8"
  )
);

const maxAttempts = Number(
  evalSet.evidenceLoop?.maxAttempts ?? 3
);
if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
  throw new TypeError(
    "evidenceLoop.maxAttempts must be a positive integer"
  );
}

let scenario = null;
for (const rel of manifest.scenarioFiles ?? []) {
  const candidate = JSON.parse(
    await fs.readFile(path.join(packRoot, rel), "utf8")
  );
  if (candidate.scenarioId === scenarioIdArg) {
    scenario = candidate;
  }
}
if (!scenario) {
  throw new Error(`Unknown scenario ${scenarioIdArg}`);
}

const outRoot = path.resolve(root, outArg);
const relativeOut = path.relative(root, outRoot);
if (
  !relativeOut ||
  relativeOut.startsWith("..") ||
  path.isAbsolute(relativeOut)
) {
  throw new Error(
    "output directory must stay inside repository"
  );
}

const adapterPath = path.resolve(root, adapterArg);
const adapterDir = path.dirname(adapterPath);
const adapter = JSON.parse(
  await fs.readFile(adapterPath, "utf8")
);
adapter.args = (adapter.args ?? []).map((arg) =>
  arg.startsWith("./") || arg.startsWith("../")
    ? path.resolve(adapterDir, arg)
    : arg
);

await fs.rm(outRoot, { recursive: true, force: true });
await fs.mkdir(outRoot, { recursive: true });

function evidenceRef(version) {
  return manifest.evidenceRefTemplate.replace(
    "{version}",
    String(version)
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
    throw new Error(
      `${label} must stay inside its declared root`
    );
  }
  return resolved;
}

function gradeVersion(workspace, version) {
  const grader = path.join(packRoot, manifest.grader.path);
  const result = spawnSync(
    process.execPath,
    [grader, workspace, String(version)],
    {
      cwd: root,
      encoding: "utf8"
    }
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

async function readContextKind(workspace, kind) {
  if (kind === "contract") {
    return {
      source: manifest.activeContractPath,
      content: await fs.readFile(
        path.join(workspace, manifest.activeContractPath),
        "utf8"
      )
    };
  }

  if (kind === "implementation") {
    const rel = taskProfile.implementationPath;
    return {
      source: rel,
      content: await fs.readFile(
        resolveInside(
          workspace,
          rel,
          "implementationPath"
        ),
        "utf8"
      )
    };
  }

  const rel = taskProfile.contextFiles?.[kind];
  if (!rel) return null;

  const full = resolveInside(
    workspace,
    rel,
    `contextFiles.${kind}`
  );
  try {
    return {
      source: rel,
      content: await fs.readFile(full, "utf8")
    };
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function buildContextBundle(workspace, kinds) {
  const sections = [];

  for (const kind of kinds) {
    const item = await readContextKind(workspace, kind);
    if (!item) continue;

    sections.push([
      `## ${kind}`,
      "",
      `Source: ${item.source}`,
      "",
      "~~~text",
      item.content.trimEnd(),
      "~~~"
    ].join("\n"));
  }

  if (!sections.length) return null;

  return [
    "# Bounded Worker Context",
    "",
    "This package was selected by the frozen evidence-aware coordination condition.",
    "The authoritative workspace and active contract remain available to every executor.",
    "",
    ...sections
  ].join("\n\n") + "\n";
}

async function readProviderTelemetry(runRoot) {
  try {
    return JSON.parse(
      await fs.readFile(
        path.join(
          runRoot,
          "provider-wrapper-telemetry.json"
        ),
        "utf8"
      )
    );
  } catch {
    return null;
  }
}

function infrastructureFailure(
  execution,
  providerTelemetry
) {
  return (
    execution.telemetry.timedOut === true ||
    (
      providerTelemetry != null &&
      providerTelemetry.agentExitCode !== 0
    ) ||
    (
      execution.telemetry.exitCode !== 0 &&
      execution.telemetry.resultReadError != null
    )
  );
}

async function persistFinalWorkspace(workspace) {
  const destination = path.join(outRoot, "workspace");
  await fs.rm(destination, {
    recursive: true,
    force: true
  });
  await fs.cp(workspace, destination, {
    recursive: true
  });
}

const attempt01Out = path.join(outRoot, "attempt-01");
const attempt01Rel = path
  .relative(root, attempt01Out)
  .split(path.sep)
  .join("/");

const firstProc = spawnSync(
  process.execPath,
  [
    path.join(
      root,
      "scripts/run-ontology-stress-cell-v0.3.2.mjs"
    ),
    manifestArg,
    scenarioIdArg,
    ontologyArg,
    evalSetArg,
    baselineId,
    attempt01Rel,
    adapterArg
  ],
  {
    cwd: root,
    encoding: "utf8"
  }
);

const firstResult = JSON.parse(
  await fs.readFile(
    path.join(
      attempt01Out,
      "ontology-stress-cell-result.json"
    ),
    "utf8"
  )
);

if (
  firstResult.status === "infrastructure_failed" ||
  firstResult.eligibleForScientificAnalysis !== true
) {
  const output = {
    ...firstResult,
    evidenceLoop: {
      schemaVersion: 1,
      maxAttempts,
      attempted: 1,
      stoppedReason: "attempt_1_not_analyzable"
    }
  };

  await fs.writeFile(
    path.join(
      outRoot,
      "ontology-stress-cell-result.json"
    ),
    JSON.stringify(output, null, 2) + "\n"
  );

  process.stdout.write(
    JSON.stringify(output, null, 2) + "\n"
  );
  process.exit(
    firstResult.status === "infrastructure_failed"
      ? 3
      : firstProc.status ?? 4
  );
}

const workspace = path.join(attempt01Out, "workspace");
const targetVersion = scenario.targetContractVersion;
const targetEvidenceRef = evidenceRef(targetVersion);
const taskInstruction = await fs.readFile(
  path.join(workspace, "TASK.md"),
  "utf8"
);

let finalGrade = firstResult.final.grade;
let finalCoordination = firstResult.coordination;
let totalAgentExecutionMs =
  firstResult.execution.agentExecutionMs ?? 0;
let extraRecoveryMs = 0;

const attempts = [
  {
    attempt: 1,
    source: "frozen_one_shot_cell",
    coordination: firstResult.coordination,
    execution: firstResult.execution,
    grade: firstResult.final.grade,
    evidenceSatisfied:
      firstResult.final.evidenceSatisfied === true
  }
];

if (
  finalGrade.correct === true &&
  firstResult.final.evidenceSatisfied === true
) {
  await persistFinalWorkspace(workspace);

  const output = {
    ...firstResult,
    evidenceLoop: {
      schemaVersion: 1,
      maxAttempts,
      attempted: 1,
      stoppedReason: "authoritative_evidence_satisfied",
      attempts
    }
  };

  await fs.writeFile(
    path.join(
      outRoot,
      "ontology-stress-cell-result.json"
    ),
    JSON.stringify(output, null, 2) + "\n"
  );
  process.stdout.write(
    JSON.stringify(output, null, 2) + "\n"
  );
  process.exit(0);
}

let previousFeedback = deriveEvidenceFeedback({
  graderChecks: finalGrade.checks ?? [],
  feedbackConfig
});

for (
  let attempt = 2;
  attempt <= maxAttempts;
  attempt += 1
) {
  const attemptRoot = path.join(
    outRoot,
    `attempt-${String(attempt).padStart(2, "0")}`
  );
  const executionRoot = path.join(
    attemptRoot,
    "execution"
  );
  await fs.mkdir(executionRoot, {
    recursive: true
  });

  const planningScenario = {
    ...scenario,
    scenarioId:
      `${scenario.scenarioId}:evidence-retry-${attempt}`,
    stateRequirements:
      previousFeedback.stateRequirements,
    stateObjective:
      "Resolve the authoritative evidence obligations that remain unsatisfied.",
    stateRationale:
      "The previous executor completed, but authoritative evidence shows the Need remains unsatisfied."
  };

  const coordination =
    planOntologyStressResponsibility({
      baselineId,
      scenario: planningScenario,
      evidenceRef: targetEvidenceRef,
      config
    });

  const feedbackText = renderEvidenceFeedback(
    previousFeedback,
    {
      attemptNumber: attempt - 1
    }
  );
  const feedbackPath = path.join(
    workspace,
    "PLH_EVIDENCE_FEEDBACK.md"
  );
  await fs.writeFile(
    feedbackPath,
    feedbackText,
    "utf8"
  );
  await fs.writeFile(
    path.join(
      executionRoot,
      "evidence-feedback.md"
    ),
    feedbackText,
    "utf8"
  );

  const bundle = await buildContextBundle(
    workspace,
    coordination.contextKinds
  );
  const contextPath = path.join(
    workspace,
    "PLH_CONTEXT.md"
  );

  if (bundle != null) {
    await fs.writeFile(
      contextPath,
      bundle,
      "utf8"
    );
    await fs.writeFile(
      path.join(
        executionRoot,
        "context-package.md"
      ),
      bundle,
      "utf8"
    );
  }

  const retryTaskInstruction = [
    taskInstruction.trim(),
    "",
    "The previous attempt did not satisfy authoritative evidence.",
    "Read PLH_EVIDENCE_FEEDBACK.md before deciding what to do.",
    bundle == null
      ? ""
      : "Also read PLH_CONTEXT.md; it is bounded prior context selected by the frozen coordination condition.",
    "Public npm test success is not sufficient evidence of completion.",
    "Inspect the active contract and authoritative state needed for the unsatisfied obligations.",
    "Modify the implementation when required, run npm test, and stop only after you have addressed the listed obligations.",
    "Do not inspect grader source or hidden tests."
  ].filter(Boolean).join("\n");

  const region = {
    id:
      `region:local-evidence-loop:${manifest.taskPackId}:${scenario.scenarioId}:${attempt}`,
    goalId: coordination.need.goalId,
    stateVersion: coordination.need.stateVersion
  };

  const request = createExecutionRequest({
    region,
    need: coordination.need,
    responsibility: coordination.responsibility,
    workspace,
    taskInstruction: retryTaskInstruction,
    contextPackageRefs: [
      "PLH_EVIDENCE_FEEDBACK.md",
      ...(bundle == null ? [] : ["PLH_CONTEXT.md"])
    ],
    expectedEvidenceRefs:
      coordination.need.evidenceObligations,
    metadata: {
      evaluationSetId: evalSet.evaluationSetId,
      baselineId,
      taskPackId: manifest.taskPackId,
      scenarioId: scenario.scenarioId,
      scenarioClass:
        scenario.kind === "clean"
          ? "clean"
          : scenario.perturbation.type,
      targetContractVersion: targetVersion,
      evidenceAwareAttempt: attempt,
      previousUnsatisfiedObligationIds:
        previousFeedback.obligations.map(
          (item) => item.obligationId
        ),
      selectedWorkerId:
        coordination.selectedWorkerId,
      selectedRoleId:
        coordination.selectedRoleId
    }
  });

  const attemptStartedMs = Date.now();
  let execution;
  try {
    execution = await runCommandAgent(
      request,
      adapter,
      {
        runRoot: executionRoot
      }
    );
  } finally {
    await fs.rm(feedbackPath, {
      force: true
    });
    await fs.rm(contextPath, {
      force: true
    });
  }
  const attemptFinishedMs = Date.now();

  const providerTelemetry =
    await readProviderTelemetry(executionRoot);

  if (
    infrastructureFailure(
      execution,
      providerTelemetry
    )
  ) {
    await persistFinalWorkspace(workspace);

    const output = {
      schemaVersion: 1,
      taskPackId: manifest.taskPackId,
      scenarioId: scenario.scenarioId,
      scenarioClass:
        scenario.kind === "clean"
          ? "clean"
          : scenario.perturbation.type,
      baselineId,
      status: "infrastructure_failed",
      failureClass: "executor_infrastructure",
      eligibleForScientificAnalysis: false,
      initialPreparation:
        firstResult.initialPreparation,
      perturbation: firstResult.perturbation,
      preActionGrade:
        firstResult.preActionGrade,
      coordination,
      execution: {
        resultStatus: execution.result.status,
        adapterExitCode:
          execution.telemetry.exitCode,
        adapterSignal:
          execution.telemetry.signal,
        timedOut:
          execution.telemetry.timedOut,
        durationMs:
          execution.telemetry.durationMs,
        resultReadError:
          execution.telemetry.resultReadError,
        provider: providerTelemetry
      },
      evidenceLoop: {
        schemaVersion: 1,
        maxAttempts,
        attempted: attempt,
        stoppedReason:
          "executor_infrastructure_failure",
        attempts
      }
    };

    await fs.writeFile(
      path.join(
        outRoot,
        "ontology-stress-cell-result.json"
      ),
      JSON.stringify(output, null, 2) + "\n"
    );
    process.stdout.write(
      JSON.stringify(output, null, 2) + "\n"
    );
    process.exit(3);
  }

  totalAgentExecutionMs +=
    execution.telemetry.durationMs ?? 0;
  extraRecoveryMs +=
    attemptFinishedMs - attemptStartedMs;

  finalGrade = gradeVersion(
    workspace,
    targetVersion
  );
  const evidenceSatisfied =
    finalGrade.correct === true &&
    (finalGrade.evidenceRefs ?? []).includes(
      targetEvidenceRef
    );

  attempts.push({
    attempt,
    source: "authoritative_evidence_retry",
    feedbackInput: previousFeedback,
    coordination: {
      ontologyType: coordination.ontologyType,
      selectedRoleId:
        coordination.selectedRoleId,
      roleDecision:
        coordination.roleDecision,
      selectedWorkerId:
        coordination.selectedWorkerId,
      contextKinds:
        coordination.contextKinds,
      needId: coordination.need.id,
      responsibilityId:
        coordination.responsibility.id
    },
    execution: {
      resultStatus: execution.result.status,
      agentExecutionMs:
        execution.telemetry.durationMs,
      publicTestExitCode:
        providerTelemetry?.publicTestExitCode ??
        null
    },
    grade: finalGrade,
    evidenceSatisfied
  });

  finalCoordination = coordination;

  if (evidenceSatisfied) {
    break;
  }

  previousFeedback = deriveEvidenceFeedback({
    graderChecks: finalGrade.checks ?? [],
    feedbackConfig
  });
}

await persistFinalWorkspace(workspace);

const finalEvidenceSatisfied =
  finalGrade.correct === true &&
  (finalGrade.evidenceRefs ?? []).includes(
    targetEvidenceRef
  );
const success = finalEvidenceSatisfied;

const output = {
  schemaVersion: 1,
  taskPackId: manifest.taskPackId,
  scenarioId: scenario.scenarioId,
  scenarioClass:
    scenario.kind === "clean"
      ? "clean"
      : scenario.perturbation.type,
  baselineId,
  status: success ? "succeeded" : "failed",
  eligibleForScientificAnalysis: true,
  initialPreparation:
    firstResult.initialPreparation,
  perturbation:
    firstResult.perturbation,
  preActionGrade:
    firstResult.preActionGrade,
  coordination: {
    ontologyType:
      finalCoordination.ontologyType,
    selectedRoleId:
      finalCoordination.selectedRoleId,
    roleDecision:
      finalCoordination.roleDecision,
    selectedWorkerId:
      finalCoordination.selectedWorkerId,
    contextKinds:
      finalCoordination.contextKinds,
    assignmentDecision:
      finalCoordination.assignmentDecision,
    needId:
      finalCoordination.needId ??
      finalCoordination.need?.id,
    responsibilityId:
      finalCoordination.responsibilityId ??
      finalCoordination.responsibility?.id
  },
  execution: {
    status: "completed",
    attemptCount: attempts.length,
    agentExecutionMs: totalAgentExecutionMs,
    recoveryLatencyMs:
      scenario.kind === "perturbed"
        ? (
            firstResult.execution.recoveryLatencyMs ??
            0
          ) + extraRecoveryMs
        : null
  },
  final: {
    correct: finalGrade.correct === true,
    evidenceSatisfied:
      finalEvidenceSatisfied,
    needFinishStatus:
      success ? "completed" : "unsatisfied",
    grade: finalGrade
  },
  evidenceLoop: {
    schemaVersion: 1,
    maxAttempts,
    attempted: attempts.length,
    stoppedReason:
      success
        ? "authoritative_evidence_satisfied"
        : "attempt_budget_exhausted",
    attempts
  }
};

await fs.writeFile(
  path.join(
    outRoot,
    "ontology-stress-cell-result.json"
  ),
  JSON.stringify(output, null, 2) + "\n"
);
process.stdout.write(
  JSON.stringify(output, null, 2) + "\n"
);
process.exit(success ? 0 : 1);
