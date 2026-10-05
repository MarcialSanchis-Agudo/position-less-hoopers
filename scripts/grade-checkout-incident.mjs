import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const runRootArg = process.argv[2];

if (!runRootArg) {
  process.stderr.write("usage: node grade-checkout-incident.mjs <runRoot>\n");
  process.exit(2);
}

const runRoot = path.resolve(root, runRootArg);
const meta = JSON.parse(await fs.readFile(path.join(runRoot, "run-meta.json"), "utf8"));
const workspace = path.join(runRoot, "workspace");
const grader = path.join(root, "examples/checkout-incident/grader/grade.mjs");

const result = spawnSync(
  process.execPath,
  [grader, workspace, String(meta.targetContractVersion)],
  { cwd: root, encoding: "utf8" }
);

const parsed = JSON.parse(result.stdout);
const output = {
  ...parsed,
  scenarioId: meta.scenarioId,
  policy: meta.policy,
  graderVersion: "checkout-grader-v1"
};

await fs.writeFile(
  path.join(runRoot, "grade.json"),
  JSON.stringify(output, null, 2) + "\n"
);

process.stdout.write(JSON.stringify(output, null, 2) + "\n");
process.exit(output.correct ? 0 : 1);

