import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  createExecutionRequest,
  finishResponsibility,
  normalizeTaskPackManifest,
  planOntologyStressResponsibility,
  runCommandAgent
} from "../src/index.mjs";

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
    "usage: node run-ontology-stress-cell.mjs <task-pack.json> <scenarioId> <ontology.json> <eval-set.json> <baselineId> <outDir> <adapter.json>\n"
  );
  process.exit(2);
}

const manifestPath = path.resolve(root, manifestArg);
const packRoot = path.dirname(manifestPath);
const manifest = normalizeTaskPackManifest(
  JSON.parse(await fs.readFile(manifestPath, "utf8"))
);
const config = JSON.parse(
  await fs.readFile(path.resolve(root, ontologyArg), "utf8")
);
const evalSet = JSON.parse(
  await fs.readFile(path.resolve(root, evalSetArg), "utf8")
);
const taskProfile = evalSet.taskProfiles?.[manifest.taskPackId];
if (!taskProfile) {
  throw new Error(`No v0.3 task profile for ${manifest.taskPackId}`);
}

let scenario = null;
for (const rel of manifest.scenarioFiles) {
  const candidate = JSON.parse(
    await fs.readFile(path.join(packRoot, rel), "utf8")
  );
  if (candidate.scenarioId === scenarioIdArg) scenario = candidate;
}
if (!scenario) throw new Error(`Unknown scenario ${scenarioIdArg}`);

const outRoot = path.resolve(root, outArg);
const relativeOut = path.relative(root, outRoot);
if (!relativeOut || relativeOut.startsWith("..") || path.isAbsolute(relativeOut)) {
  throw new Error("output directory must stay inside repository");
}

const adapterPath = path.resolve(root, adapterArg);
const adapterDir = path.dirname(adapterPath);
const adapter = JSON.parse(await fs.readFile(adapterPath, "utf8"));
adapter.args = (adapter.args ?? []).map((arg) =>
  arg.startsWith("./") || arg.startsWith("../")
    ? path.resolve(adapterDir, arg)
    : arg
);

function resolveInside(base, relativePath, label) {
  const resolved = path.resolve(base, relativePath);
  const relative = path.relative(base, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} must stay inside its declared root`);
  }
  return resolved;
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

async function revealContract(workspace, version) {
  const rel = manifest.contracts[String(version)];
  if (!rel) throw new Error(`No contract v${version}`);
  const destination = path.join(workspace, manifest.activeContractPath);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(path.join(packRoot, rel), destination);
}

async function applyReference(workspace, version) {
  const pattern = taskProfile.referenceSolutionPattern;
  const source = resolveInside(
    packRoot,
    pattern.replace("{version}", String(version)),
    "referenceSolutionPattern"
  );
  const destination = resolveInside(
    workspace,
    taskProfile.implementationPath,
    "implementationPath"
  );
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
  return path.relative(packRoot, source).split(path.sep).join("/");
}

async function applyPerturbation(workspace) {
  const perturbation = scenario.perturbation;
  if (!perturbation) return null;

  if (perturbation.type === "contract_reveal") {
    await revealContract(workspace, perturbation.contractVersion);
    return {
      type: perturbation.type,
      contractVersion: perturbation.contractVersion
    };
  }

  if (perturbation.type === "ontology_stress_contract_mutation") {
    await revealContract(workspace, perturbation.contractVersion);

    for (const mutation of perturbation.workspaceMutations ?? []) {
      if (mutation.type !== "copy_taskpack_file") {
        throw new Error(`Unsupported workspace mutation ${mutation.type}`);
      }
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
    }

    return {
      type: perturbation.type,
      contractVersion: perturbation.contractVersion,
      workspaceMutations: perturbation.workspaceMutations ?? []
    };
  }

  throw new Error(`Unsupported v0.3 perturbation ${perturbation.type}`);
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
        resolveInside(workspace, rel, "implementationPath"),
        "utf8"
      )
    };
  }

  const rel = taskProfile.contextFiles?.[kind];
  if (!rel) return null;

  const full = resolveInside(workspace, rel, `contextFiles.${kind}`);
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
    "This package is supplied by the frozen v0.3 coordination condition.",
    "The authoritative workspace and active contract remain available to every executor.",
    "",
    ...sections
  ].join("\n\n") + "\n";
}

await fs.rm(outRoot, { recursive: true, force: true });
await fs.mkdir(outRoot, { recursive: true });

const workspace = path.join(outRoot, "workspace");
await copyDir(path.join(packRoot, manifest.seedPath), workspace);
await revealContract(workspace, scenario.initialContractVersion);

let initialGrade = gradeVersion(
  workspace,
  scenario.initialContractVersion
);
let initialPreparation = {
  referenceApplied: false,
  referenceSource: null,
  grade: initialGrade
};

if (scenario.kind === "perturbed" && !initialGrade.correct) {
  const referenceSource = await applyReference(
    workspace,
    scenario.initialContractVersion
  );
  initialGrade = gradeVersion(
    workspace,
    scenario.initialContractVersion
  );
  initialPreparation = {
    referenceApplied: true,
    referenceSource,
    grade: initialGrade
  };
}

if (scenario.kind === "perturbed" && !initialGrade.correct) {
  throw new Error("Could not establish correct initial state");
}

const perturbationStartedMs = Date.now();
const perturbationEvent = scenario.kind === "perturbed"
  ? await applyPerturbation(workspace)
  : null;
const perturbationAppliedMs = Date.now();

const targetVersion = scenario.targetContractVersion;
const preActionGrade = gradeVersion(workspace, targetVersion);

if (preActionGrade.correct) {
  const invalid = {
    schemaVersion: 1,
    taskPackId: manifest.taskPackId,
    scenarioId: scenario.scenarioId,
    baselineId,
    status: "not_discriminating",
    eligibleForScientificAnalysis: false,
    initialPreparation,
    perturbationEvent,
    preActionGrade
  };
  await fs.writeFile(
    path.join(outRoot, "ontology-stress-cell-result.json"),
    JSON.stringify(invalid, null, 2) + "\n"
  );
  process.stdout.write(JSON.stringify(invalid, null, 2) + "\n");
  process.exit(4);
}

const coordination = planOntologyStressResponsibility({
  baselineId,
  scenario,
  evidenceRef: evidenceRef(targetVersion),
  config
});

const bundle = await buildContextBundle(
  workspace,
  coordination.contextKinds
);
const contextPath = path.join(workspace, "PLH_CONTEXT.md");
const executionRoot = path.join(outRoot, "execution");
await fs.mkdir(executionRoot, { recursive: true });

if (bundle != null) {
  await fs.writeFile(contextPath, bundle, "utf8");
  await fs.writeFile(
    path.join(executionRoot, "context-package.md"),
    bundle,
    "utf8"
  );
}

const taskInstruction = await fs.readFile(
  path.join(workspace, "TASK.md"),
  "utf8"
);
const taskInstructionForWorker = bundle == null
  ? taskInstruction
  : taskInstruction.trim() +
    "\n\nBefore solving, read PLH_CONTEXT.md. It is bounded prior context supplied by the frozen v0.3 coordination condition; authoritative workspace state remains available.";

const region = {
  id: `region:ontology-stress:${manifest.taskPackId}:${scenario.scenarioId}`,
  goalId: coordination.need.goalId,
  stateVersion: coordination.need.stateVersion
};

const request = createExecutionRequest({
  region,
  need: coordination.need,
  responsibility: coordination.responsibility,
  workspace,
  taskInstruction: taskInstructionForWorker,
  contextPackageRefs: bundle == null ? [] : ["PLH_CONTEXT.md"],
  expectedEvidenceRefs: coordination.need.evidenceObligations,
  metadata: {
    evaluationSetId: evalSet.evaluationSetId,
    ontologySetId: config.ontologySetId,
    baselineId,
    ontologyType: coordination.ontologyType,
    selectedRoleId: coordination.selectedRoleId,
    selectedWorkerId: coordination.selectedWorkerId,
    taskPackId: manifest.taskPackId,
    scenarioId: scenario.scenarioId,
    scenarioClass:
      scenario.kind === "clean"
        ? "clean"
        : scenario.perturbation.type,
    targetContractVersion: targetVersion,
    stateRequirements: scenario.stateRequirements,
    adapterId: adapter.adapterId
  }
});

const startedMs = Date.now();
let execution;
try {
  execution = await runCommandAgent(request, adapter, {
    runRoot: executionRoot
  });
} finally {
  await fs.rm(contextPath, { force: true });
}
const completedMs = Date.now();

const finalGrade = gradeVersion(workspace, targetVersion);
const evidence = finalGrade.correct
  ? finalGrade.evidenceRefs ?? []
  : [];

const finished = finishResponsibility({
  need: coordination.need,
  responsibility: coordination.responsibility,
  completedAt: new Date().toISOString(),
  evidenceRefs: evidence
});

const evidenceSatisfied =
  coordination.need.evidenceObligations.every(
    (ref) => evidence.includes(ref)
  );
const success =
  finalGrade.correct === true && evidenceSatisfied;

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
  eligibleForScientificAnalysis : true,
  initialPreparation,
  perturbation: {
    event: perturbationEvent,
    injectionDurationMs: scenario.kind === "perturbed"
      ? perturbationAppliedMs - perturbationStartedMs
      : null
  },
  preActionGrade,
  coordination: {
    ontologyType: coordination.ontologyType,
    selectedRoleId: coordination.selectedRoleId,
    roleDecision: coordination.roleDecision,
    selectedWorkerId: coordination.selectedWorkerId,
    contextKinds: coordination.contextKinds,
    assignmentDecision: coordination.assignmentDecision,
    needId: coordination.need.id,
    responsibilityId: coordination.responsibility.id
  },
  execution: {
    status: execution.result.status,
    agentExecutionMs: execution.telemetry.durationMs,
    recoveryLatencyMs: scenario.kind === "perturbed"
      ? completedMs - perturbationAppliedMs
      : null
  },
  final: {
    correct: finalGrade.correct === true,
    evidenceSatisfied,
    needFinishStatus: finished.status,
    grade: finalGrade
  }
};

// The frozen cell persists its exact coordination trace before the matrix summarizes it.
await fs.writeFile(
  path.join(outRoot, "ontology-stress-cell-result.json"),
  JSON.stringify(output, null, 2) + "\n"
);

process.stdout.write(JSON.stringify(output, null, 2) + "\n");
process.exit(success ? 0 : 1);