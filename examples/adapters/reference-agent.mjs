import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");

const requestPath = process.env.PLH_EXECUTION_REQUEST;
const resultPath = process.env.PLH_EXECUTION_RESULT;
const workspace = process.env.PLH_WORKSPACE;

if (!requestPath || !resultPath || !workspace) {
  process.stderr.write("Missing PLH execution environment variables\n");
  process.exit(2);
}

const request = JSON.parse(await fs.readFile(requestPath, "utf8"));
const taskPackId = request.metadata?.taskPackId;

let contractPath;
let destination;
let referenceRoot;

if (taskPackId === "checkout-incident") {
  contractPath = path.join(workspace, "contract/payment-callback.json");
  destination = path.join(workspace, "src/checkout.mjs");
  referenceRoot = path.join(repoRoot, "examples/checkout-incident/reference-solution");
} else if (taskPackId === "config-migration-incident") {
  contractPath = path.join(workspace, "contract/migration.json");
  destination = path.join(workspace, "src/migrate.mjs");
  referenceRoot = path.join(repoRoot, "examples/config-migration-incident/reference-solution");
} else if (taskPackId === "deployment-rollout-incident") {
  contractPath = path.join(workspace, "contract/rollout.json");
  destination = path.join(workspace, "src/rollout.mjs");
  referenceRoot = path.join(repoRoot, "examples/deployment-rollout-incident/reference-solution");
} else {
  await fs.writeFile(resultPath, JSON.stringify({
    schemaVersion: 1,
    requestId: request.requestId,
    status: "failed",
    evidenceRefs: [],
    summary: `Reference adapter does not support TaskPack ${taskPackId}`,
    retryable: false
  }, null, 2) + "\n");
  process.exit(1);
}

const contract = JSON.parse(await fs.readFile(contractPath, "utf8"));
const version = Number(contract.contractVersion);

if (version >= 2) {
  const source = path.join(referenceRoot, `v${version}.mjs`);
  await fs.copyFile(source, destination);
}

await fs.writeFile(resultPath, JSON.stringify({
  schemaVersion: 1,
  requestId: request.requestId,
  status: "completed",
  evidenceRefs: request.expectedEvidenceRefs,
  summary: `Reference solution aligned to ${taskPackId} contract v${version}`
}, null, 2) + "\n");

process.stdout.write(`reference-agent aligned ${taskPackId} to v${version}\n`);

