import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const runRootArg = process.argv[2];
if (!runRootArg) {
  process.stderr.write("usage: node inject-checkout-perturbation.mjs <runRoot>\n");
  process.exit(2);
}

const runRoot = path.resolve(root, runRootArg);
const meta = JSON.parse(await fs.readFile(path.join(runRoot, "run-meta.json"), "utf8"));
const workspace = path.join(runRoot, "workspace");

if (!meta.perturbation) {
  process.stdout.write(JSON.stringify({ applied: false, reason: "clean_scenario" }) + "\n");
  process.exit(0);
}

const type = meta.perturbation.type;

if (type === "contract_reveal" || type === "external_contract_mutation") {
  const version = meta.perturbation.contractVersion;
  const source = path.join(
    root,
    "examples/checkout-incident/contracts",
    `v${version}.json`
  );

  await fs.copyFile(source, path.join(workspace, "contract/payment-callback.json"));

  const event = {
    schemaVersion: 1,
    type,
    contractVersion: version,
    appliedAt: new Date().toISOString()
  };

  await fs.writeFile(
    path.join(runRoot, "perturbation-event.json"),
    JSON.stringify(event, null, 2) + "\n"
  );

  process.stdout.write(JSON.stringify({ applied: true, ...event }) + "\n");
  process.exit(0);
}

if (type === "worker_loss") {
  const event = {
    schemaVersion: 1,
    type: "worker_loss",
    target: meta.perturbation.target,
    appliedAt: new Date().toISOString()
  };

  await fs.writeFile(
    path.join(runRoot, "perturbation-event.json"),
    JSON.stringify(event, null, 2) + "\n"
  );

  process.stdout.write(JSON.stringify({ applied: true, ...event }) + "\n");
  process.exit(0);
}

throw new Error(`unsupported perturbation type: ${type}`);

