import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  classifyPublicationScenario,
  createExecutionRequest,
  finishResponsibility,
  normalizeTaskPackManifest,
  planPublicationResponsibility,
  runCommandAgent
} from "../src/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const manifestArg = process.argv[2];
const scenarioIdArg = process.argv[3];
const baselineConfigArg = process.argv[4];
const baselineId = process.argv[5];
const outArg = process.argv[6];
const adapterArg = process.argv[7];

if (
  !manifestArg ||
  !scenarioIdArg ||
  !baselineConfigArg ||
  !baselineId ||
  !outArg ||
  !adapterArg
) {
  process.stderr.write(
    "usage: node run-publication-baseline-cell.mjs <task-pack.json> <scenarioId> <baseline-config.json> <baselineId> <outDir> <adapter.json>\n"
  );
  process.exit(2);
}

const manifestPath = path.resolve(root, manifestArg);
const packRoot = path.dirname(manifestPath);
const rawManifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const manifest = normalizeTaskPackManifest(rawManifest);
const baselineConfig = JSON.parse(
  await fs.readFile(path.resolve(root, baselineConfigArg), "utf8")
);
const taskProfile = baselineConfig.taskProfiles?.[manifest.taskPackId];
if (!taskProfile) {
  throw new Error(`No publication task profile for ${manifest.taskPackId}`);
}

const scenarios = [];
for (const rel of manifest.scenarioFiles) {
  scenarios.push(
    JSON.parse(await fs.readFile(path.join(packRoot, rel), "utf8"))
  );
}
const scenario = scenarios.find((item) => item.scenarioId === scenarioIdArg);
if (!scenario) throw new Error(`Unknown scenario: ${scenarioIdArg}`);

const classification = classifyPublicationScenario(scenario);
if (classification.scenarioClass === "worker_loss") {
  throw new Error("worker_loss is not eligible for the publication baseline harness");
}

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
  if (!rel) throw new Error(`No contract v${version} in TaskPack`);
  const destination = path.join(workspace, manifest.activeContractPath);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(path.join(packRoot, rel), destination);
}

async function applyReference(workspace, version) {
  const pattern = taskProfile.referenceSolutionPattern ??
    "reference-solution/v{version}.mjs";
  const rel = pattern.replace("{version}", String(version));
  const source = resolveInside(packRoot, rel, "referenceSolutionPattern");
  const destination = resolveInside(
    workspace,
    taskProfile.implementationPath,
    "taskProfile.implementationPath"
  );
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
  return rel;
}

async function applyPerturbation(workspace) {
  const perturbation = scenario.perturbation;
  if (!perturbation) return null;

  if (
    perturbation.type === "contract_reveal" ||
    perturbation.type === "external_contract_mutation"
  ) {
    await revealContract(workspace, perturbation.contractVersion);
    return {
      type: perturbation.type,
      contractVersion: perturbation.contractVersion
    };
  }

  if (perturbation.type === "workspace_regression") {
    const source = resolveInside(
      packRoot,
      perturbation.source,
      "workspace_regression.source"
    );
    const destination = resolveInside(
      workspace,
      perturbation.destination,
      "workspace_regression.destination"
    );
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
    return {
      type: perturbation.type,
      source: perturbation.source,
      destination: perturbation.destination
    };
  }

  throw new Error(`Unsupported publication perturbation: ${perturbation.type}`);
}

async function contextBundle(workspace, kinds) {
  const sections = [];

  if (kinds.includes("implementation")) {
    const implementationPath = resolveInside(
      workspace,
      taskProfile.implementationPath,
      "taskProfile.implementationPath"
    );
    const implementation = await fs.readFile(implementationPath, "utf8");
    sections.push([
      "## Implementation snapshot",
      "",
      `Source: ${taskProfile.implementationPath}`,
      "",
      "```js",
      implementation.trimEnd(),
      "```"
    ].join("\n"));
  }

  if (kinds.includes("contract")) {
    const contractPath = path.join(workspace, manifest.activeContractPath);
    const contract = await fs.readFile(contractPath, "utf8");
    sections.push([
      "## Active contract snapshot",
      "",
      `Source: ${manifest.activeContractPath}`,
      "",
      "```json",
      contract.trimEnd(),
      "```"
    ].join("\n"));
  }

  if (!sections.length) return null;

  return [
    "# Bounded Worker Context",
    "",
    "This context package is supplied by the frozen publication coordination condition.",
    "The workspace and active contract remain authoritative.",
    "Do not infer grader behavior from this package.",
    "",
    ...sections
  ].join("\n\n") + "\n";
}

await fs.rm(outRoot, { recursive: true, force: true });
await fs.mkdir(outRoot, { recursive: true });

const workspace = path.join(outRoot, "workspace");
await copyDir(path.join(packRoot, manifest.seedPath), workspace);
await revealContract(workspace, scenario.initialContractVersion);

const taskInstruction = await fs.readFile(
  path.join(workspace, "TASK.md"),
  "utf8"
);

let initialPreparation = {
  referenceApplied: false,
  referenceSource: null,
  grade: gradeVersion(workspace, scenario.initialContractVersion)
};

if (scenario.kind === "perturbed") {
  if (!initialPreparation.grade.correct) {
    const referenceSource = await applyReference(
      workspace,
      scenario.initialContractVersion
    );
    initialPreparation = {
      referenceApplied: true,
      referenceSource,
      grade: gradeVersion(workspace, scenario.initialContractVersion)
    };
  }

  if (!initialPreparation.grade.correct) {
    throw new Error(
      `Could not establish correct pre-perturbation state for ${scenario.scenarioId}`
    );
  }
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
    path.join(outRoot, "publication-cell-result.json"),
    JSON.stringify(invalid, null, 2) + "\n"
  );
  process.stdout.write(JSON.stringify(invalid, null, 2) + "\n");
  process.exit(4);
}

const coordination = planPublicationResponsibility({
  baselineId,
  phaseKind: classification.phaseKind,
  taskPackId: manifest.taskPackId,
  scenarioId: scenario.scenarioId,
  contractVersion: targetVersion,
  evidenceRef: evidenceRef(targetVersion),
  config: baselineConfig
});

const bundle = await contextBundle(workspace, coordination.contextKinds);
const workspaceContextPath = path.join(workspace, "PLH_CONTEXT.md");
const executionRoot = path.join(outRoot, "execution");
await fs.mkdir(executionRoot, { recursive: true });

if (bundle != null) {
  await fs.writeFile(workspaceContextPath, bundle, "utf8");
  await fs.writeFile(
    path.join(executionRoot, "context-package.md"),
    bundle,
    "utf8"
  );
}

const taskInstructionForWorker = bundle == null
  ? taskInstruction
  : taskInstruction.trim() +
    "\n\nBefore solving, read PLH_CONTEXT.md. It is bounded prior context supplied by the frozen coordination condition; the active contract remains authoritative.";

const region = {
  id: `region:publication:${manifest.taskPackId}:${scenario.scenarioId}`,
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
    evaluationSet: baselineConfig.evaluationSetId ?? null,
    baselineSetId: baselineConfig.baselineSetId,
    baselineId,
    ontologyType: coordination.ontologyType,
    predefinedRoleId: coordination.predefinedRoleId,
    selectedWorkerId: coordination.selectedWorkerId,
    contextKinds: coordination.contextKinds,
    taskPackId: manifest.taskPackId,
    scenarioId: scenario.scenarioId,
    scenarioClass: classification.scenarioClass,
    phaseKind: classification.phaseKind,
    targetContractVersion: targetVersion,
    adapterId: adapter.adapterId
  }
});

const executionStartedMs = Date.now();
let execution;
try {
  execution = await runCommandAgent(request, adapter, {
    runRoot: executionRoot
  });
} finally {
  await fs.rm(workspaceContextPath, { force: true });
}
const executionCompletedMs = Date.now();

const finalGrade = gradeVersion(workspace, targetVersion);
const authoritativeEvidence = finalGrade.correct
  ? finalGrade.evidenceRefs ?? []
  : [];
const finished = finishResponsibility({
  need: coordination.need,
  responsibility: coordination.responsibility,
  completedAt: new Date().toISOString(),
  evidenceRefs: authoritativeEvidence
});

const evidenceSatisfied = coordination.need.evidenceObligations.every(
  (ref) => authoritativeEvidence.includes(ref)
);
const success = finalGrade.correct === true && evidenceSatisfied;

const output = {
  schemaVersion: 1,
  taskPackId: manifest.taskPackId,
  taskPackVersion: manifest.version,
  scenarioId: scenario.scenarioId,
  scenarioClass: classification.scenarioClass,
  phaseKind: classification.phaseKind,
  baselineSetId: baselineConfig.baselineSetId,
  baselineId,
  status: success ? "succeeded" : "failed",
  eligibleForScientificAnalysis: true,
  initialPreparation,
  perturbation: {
    event: perturbationEvent,
    injectionDurationMs:
      scenario.kind === "perturbed"
        ? perturbationAppliedMs - perturbationStartedMs
        : null
  },
  preActionGrade,
  coordination: {
    ontologyType: coordination.ontologyType,
    predefinedRoleId: coordination.predefinedRoleId,
    selectedWorkerId: coordination.selectedWorkerId,
    contextKinds: coordination.contextKinds,
    needDecision: coordination.needDecision,
    assignmentDecision: coordination.assignmentDecision,
    needId: coordination.need.id,
    responsibilityId: coordination.responsibility.id
  },
  execution: {
    status: execution.result.status,
    agentExecutionMs: execution.telemetry.durationMs,
    completionLatencyMs: executionCompletedMs - executionStartedMs,
    recoveryLatencyMs:
      scenario.kind === "perturbed"
        ? executionCompletedMs - perturbationAppliedMs
        : null
  },
  final: {
    correct: finalGrade.correct === true,
    evidenceSatisfied,
    needFinishStatus: finished.status,
    grade: finalGrade
  }
};

await fs.writeFile(
  path.join(outRoot, "publication-cell-result.json"),
  JSON.stringify(output, null, 2) + "\n"
);

process.stdout.write(JSON.stringify(output, null, 2) + "\n");
process.exit(success ? 0 : 1);
