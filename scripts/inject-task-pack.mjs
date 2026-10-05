import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeTaskPackManifest } from "../src/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const runRootArg = process.argv[2];

if (!runRootArg) {
  process.stderr.write("usage: node inject-task-pack.mjs <runRoot>\n");
  process.exit(2);
}

const runRoot = path.resolve(root, runRootArg);
const meta = JSON.parse(
  await fs.readFile(path.join(runRoot, "run-meta.json"), "utf8")
);
const manifestPath = path.resolve(root, meta.manifestPath);
const packRoot = path.dirname(manifestPath);
const manifest = normalizeTaskPackManifest(
  JSON.parse(await fs.readFile(manifestPath, "utf8"))
);
const workspace = path.join(runRoot, "workspace");

if (!meta.perturbation) {
  const output = { applied: false, reason: "clean_scenario" };
  process.stdout.write(JSON.stringify(output) + "\n");
  process.exit(0);
}

const perturbation = meta.perturbation;
let event;

if (
  perturbation.type === "contract_reveal" ||
  perturbation.type === "external_contract_mutation"
) {
  const rel = manifest.contracts[String(perturbation.contractVersion)];
  if (!rel) {
    throw new Error(
      `No contract for perturbation version ${perturbation.contractVersion}`
    );
  }

  const destination = path.join(workspace, manifest.activeContractPath);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(path.join(packRoot, rel), destination);

  event = {
    schemaVersion: 1,
    type: perturbation.type,
    contractVersion: perturbation.contractVersion,
    appliedAt: new Date().toISOString()
  };
} else if (perturbation.type === "worker_loss") {
  event = {
    schemaVersion: 1,
    type: "worker_loss",
    target: perturbation.target ?? "current_assignee",
    appliedAt: new Date().toISOString()
  };
} else {
  throw new Error(`unsupported perturbation type: ${perturbation.type}`);
}

await fs.writeFile(
  path.join(runRoot, "perturbation-event.json"),
  JSON.stringify(event, null, 2) + "\n"
);

process.stdout.write(JSON.stringify({ applied: true, ...event }) + "\n");

