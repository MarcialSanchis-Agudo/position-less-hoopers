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
    "usage: node run-experiment-cell.mjs <runRoot> <adapter.json>\n"
  );
  process.exit(2);
}

const runRoot = path.resolve(root, runRootArg);
const adapterPath = path.resolve(root, adapterConfigArg);
const meta = JSON.parse(
  await fs.readFile(path.join(runRoot, "run-meta.json"), "utf8")
);
const adapter = JSON.parse(await fs.readFile(adapterPath, "utf8"));
const adapterDir = path.dirname(adapterPath);

adapter.args = (adapter.args ?? []).map((arg) =>
  arg.startsWith("./") || arg.startsWith("../")
    ? path.resolve(adapterDir, arg)
    : arg
);

const manifestPath = path.resolve(root, meta.manifestPath);
const manifest = normalizeTaskPackManifest(
  JSON.parse(await fs.readFile(manifestPath, "utf8"))
);

const workspace = path.join(runRoot, "workspace");
const taskInstruction = await fs.readFile(
  path.join(workspace, "TASK.md"),
  "utf8"
);

const evidenceRef = manifest.evidenceRefTemplate.replace(
  "{version}",
  String(meta.targetContractVersion)
);

const execution = await createExperimentCellExecution({
  runRoot,
  meta,
  workspace,
  adapter,
  taskInstruction,
  evidenceRef
});

const graderScript = path.join(root, "scripts/grade-task-pack.mjs");
const gradeProcess = spawnSync(
  process.execPath,
  [graderScript, path.relative(root, runRoot)],
  {
    cwd: root,
    encoding: "utf8"
  }
);

let grade;
try {
  grade = JSON.parse(gradeProcess.stdout);
} catch {
  grade = {
    schemaVersion: 1,
    correct: false,
    evidenceRefs: [],
    graderExitCode: gradeProcess.status,
    parseError: true,
    rawStdout: gradeProcess.stdout,
    rawStderr: gradeProcess.stderr
  };
}

const cell = finalizeExperimentCell({
  execution,
  grade,
  meta
});

await fs.writeFile(
  path.join(runRoot, "cell-result.json"),
  JSON.stringify(cell, null, 2) + "\n"
);

process.stdout.write(JSON.stringify({
  requestId: execution.request.requestId,
  executionStatus: execution.result.status,
  externalCorrect: cell.externalCorrect,
  authoritativeEvidenceRefs: cell.authoritativeEvidenceRefs,
  evidenceSatisfied: cell.evidenceSatisfied,
  durationMs: execution.telemetry.durationMs,
  exitCode: execution.telemetry.exitCode
}, null, 2) + "\n");

process.exit(cell.externalCorrect && cell.evidenceSatisfied ? 0 : 1);

