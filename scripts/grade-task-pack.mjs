import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { normalizeTaskPackManifest } from "../src/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const runRootArg = process.argv[2];

if (!runRootArg) {
  process.stderr.write("usage: node grade-task-pack.mjs <runRoot>\n");
  process.exit(2);
}

const runRoot = path.resolve(root, runRootArg);
const meta = JSON.parse(await fs.readFile(path.join(runRoot, "run-meta.json"), "utf8"));
const manifestPath = path.resolve(root, meta.manifestPath);
const packRoot = path.dirname(manifestPath);
const manifest = normalizeTaskPackManifest(
  JSON.parse(await fs.readFile(manifestPath, "utf8"))
);
const workspace = path.join(runRoot, "workspace");
const grader = path.join(packRoot, manifest.grader.path);

const result = spawnSync(
  process.execPath,
  [grader, workspace, String(meta.targetContractVersion)],
  { cwd: root, encoding: "utf8" }
);

let parsed;
try {
  parsed = JSON.parse(result.stdout);
} catch {
  parsed = {
    schemaVersion: 1,
    correct: false,
    evidenceRefs: [],
    parseError: true,
    rawStdout: result.stdout
  };
}

const output = {
  ...parsed,
  taskPackId: meta.taskPackId,
  scenarioId: meta.scenarioId,
  policy: meta.policy,
  graderExitCode: result.status
};

await fs.writeFile(
  path.join(runRoot, "grade.json"),
  JSON.stringify(output, null, 2) + "\n"
);

process.stdout.write(JSON.stringify(output, null, 2) + "\n");
process.exit(output.correct ? 0 : 1);

