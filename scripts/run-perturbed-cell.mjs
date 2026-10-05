import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  createExperimentCellExecution,
  finalizeExperimentCell,
  normalizeTaskPackManifest
} from "../src/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const runRootArg = process.argv[2];
const adapterConfigArg = process.argv[3];

if (!runRootArg || !adapterConfigArg) {
  process.stderr.write(
    "usage: node run-perturbed-cell.mjs <runRoot> <adapter.json>\n"
  );
  process.exit(2);
}

const runRoot = path.resolve(root, runRootArg);
const adapterPath = path.resolve(root, adapterConfigArg);
const meta = JSON.parse(
  await fs.readFile(path.join(runRoot, "run-meta.json"), "utf8")
);

if (!meta.perturbation) {
  throw new Error("run-perturbed-cell requires a perturbed scenario");
}

if (meta.perturbation.type === "worker_loss") {
  const unsupported = {
    schemaVersion: 1,
    taskPackId: meta.taskPackId,
    scenarioId: meta.scenarioId,
    policy: meta.policy,
    status: "unsupported_live_interrupt",
    eligibleForScientificAnalysis: false,
    exclusionReason:
      "Atomic CommandAgent executions cannot yet inject worker loss during a live responsibility."
  };
  await fs.writeFile(
    path.join(runRoot, "perturbed-result.json"),
    JSON.stringify(unsupported, null, 2) + "\n"
  );
  process.stdout.write(JSON.stringify(unsupported, null, 2) + "\n");
  process.exit(3);
}

const manifestPath = path.resolve(root, meta.manifestPath);
const packRoot = path.dirname(manifestPath);
const manifest = normalizeTaskPackManifest(
  JSON.parse(await fs.readFile(manifestPath, "utf8"))
);
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

const phase1Root = path.join(runRoot, "phases/phase-1");
const phase1 = await createExperimentCellExecution({
  runRoot: phase1Root,
  meta,
  workspace,
  adapter,
  taskInstruction,
  evidenceRef: evidenceRef(meta.initialContractVersion),
  contractVersion: meta.initialContractVersion,
  assignmentVersion: 1,
  phase: "pre_perturbation"
});

const phase1Grade = gradeVersion(meta.initialContractVersion);
if (!phase1Grade.correct) {
  const failed = {
    schemaVersion: 1,
    taskPackId: meta.taskPackId,
    scenarioId: meta.scenarioId,
    policy: meta.policy,
    status: "initial_execution_failed",
    phase1Grade,
    eligibleForScientificAnalysis: false,
    exclusionReason: "Executor did not satisfy the initial contract before perturbation."
  };
  await fs.writeFile(
    path.join(runRoot, "perturbed-result.json"),
    JSON.stringify(failed, null, 2) + "\n"
  );
  process.stdout.write(JSON.stringify(failed, null, 2) + "\n");
  process.exit(1);
}

const injectScript = path.join(root, "scripts/inject-task-pack.mjs");
const perturbationStartedMs = Date.now();
const injection = spawnSync(
  process.execPath,
  [injectScript, path.relative(root, runRoot)],
  { cwd: root, encoding: "utf8" }
);
const perturbationAppliedMs = Date.now();

if (injection.status !== 0) {
  throw new Error(injection.stderr || injection.stdout || "perturbation injection failed");
}

let perturbationEvent = null;
try {
  perturbationEvent = JSON.parse(
    await fs.readFile(path.join(runRoot, "perturbation-event.json"), "utf8")
  );
} catch {}

const postPerturbationGrade = gradeVersion(meta.targetContractVersion);

if (postPerturbationGrade.correct) {
  const invalid = {
    schemaVersion: 1,
    taskPackId: meta.taskPackId,
    scenarioId: meta.scenarioId,
    policy: meta.policy,
    status: "perturbation_not_discriminating",
    phase1Grade,
    postPerturbationGrade,
    perturbationEvent,
    eligibleForScientificAnalysis: false,
    exclusionReason:
      "Target contract already passed immediately after perturbation; no recovery was required."
  };
  await fs.writeFile(
    path.join(runRoot, "perturbed-result.json"),
    JSON.stringify(invalid, null, 2) + "\n"
  );
  process.stdout.write(JSON.stringify(invalid, null, 2) + "\n");
  process.exit(4);
}

const recoveryAllowed = meta.policy !== "static";
let phase2 = null;
let finalGrade = postPerturbationGrade;
let recoveryStartedMs = null;
let recoveryCompletedMs = null;

if (recoveryAllowed) {
  recoveryStartedMs = Date.now();
  const phase2Root = path.join(runRoot, "phases/phase-2");
  phase2 = await createExperimentCellExecution({
    runRoot: phase2Root,
    meta,
    workspace,
    adapter,
    taskInstruction,
    evidenceRef: evidenceRef(meta.targetContractVersion),
    contractVersion: meta.targetContractVersion,
    assignmentVersion: 1,
    phase: "recovery"
  });
  finalGrade = gradeVersion(meta.targetContractVersion);
  recoveryCompletedMs = Date.now();
}

const executionForFinal = phase2 ?? phase1;
const cell = finalizeExperimentCell({
  execution: executionForFinal,
  grade: finalGrade,
  meta
});

const output = {
  schemaVersion: 1,
  taskPackId: meta.taskPackId,
  scenarioId: meta.scenarioId,
  policy: meta.policy,
  perturbationType: meta.perturbation.type,
  status: cell.externalCorrect && cell.evidenceSatisfied
    ? "recovered"
    : recoveryAllowed
      ? "recovery_failed"
      : "no_recovery_policy",
  eligibleForScientificAnalysis: true,
  phase1: {
    executionStatus: phase1.result.status,
    durationMs: phase1.telemetry.durationMs,
    gradeCorrect: phase1Grade.correct
  },
  perturbation: {
    event: perturbationEvent,
    injectionDurationMs: perturbationAppliedMs - perturbationStartedMs,
    postPerturbationGradeCorrect: postPerturbationGrade.correct
  },
  recovery: {
    executed: recoveryAllowed,
    executionStatus: phase2?.result.status ?? null,
    durationMs: phase2?.telemetry.durationMs ?? null,
    completionLatencyMs:
      recoveryCompletedMs == null
        ? null
        : recoveryCompletedMs - perturbationAppliedMs
  },
  finalCell: cell
};

await fs.writeFile(
  path.join(runRoot, "perturbed-result.json"),
  JSON.stringify(output, null, 2) + "\n"
);

process.stdout.write(JSON.stringify(output, null, 2) + "\n");
process.exit(cell.externalCorrect && cell.evidenceSatisfied ? 0 : 1);

