import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const base = path.join(root, "examples/checkout-incident");
const seed = path.join(base, "seed");
const plan = JSON.parse(await fs.readFile(path.join(base, "experiment-plan.json"), "utf8"));
const outArg = process.argv[2] ?? "results/local/checkout-incident";
const outRoot = path.resolve(root, outArg);

const relative = path.relative(root, outRoot);
if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
  throw new Error("output directory must stay inside repository");
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

async function hashTree(dir) {
  const chunks = [];
  async function walk(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries.sort((a,b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name);
      const rel = path.relative(dir, full).split(path.sep).join("/");
      if (entry.isDirectory()) await walk(full);
      else chunks.push(rel, await fs.readFile(full));
    }
  }
  await walk(dir);
  return "sha256:" + crypto.createHash("sha256").update(Buffer.concat(
    chunks.map((item) => Buffer.isBuffer(item) ? item : Buffer.from(item))
  )).digest("hex");
}

const scenarioFiles = await fs.readdir(path.join(base, "scenarios"));
const scenarios = new Map();
for (const filename of scenarioFiles) {
  const scenario = JSON.parse(await fs.readFile(path.join(base, "scenarios", filename), "utf8"));
  scenarios.set(scenario.scenarioId, scenario);
}

await fs.rm(outRoot, { recursive: true, force: true });
await fs.mkdir(outRoot, { recursive: true });

const runs = [];
for (const scenarioId of plan.scenarios) {
  const scenario = scenarios.get(scenarioId);
  if (!scenario) throw new Error(`missing scenario ${scenarioId}`);

  for (const policy of plan.policies) {
    const runRoot = path.join(outRoot, scenarioId, policy);
    const workspace = path.join(runRoot, "workspace");
    await copyDir(seed, workspace);

    const contractSource = path.join(
      base,
      "contracts",
      `v${scenario.initialContractVersion}.json`
    );
    await fs.mkdir(path.join(workspace, "contract"), { recursive: true });
    await fs.copyFile(
      contractSource,
      path.join(workspace, "contract/payment-callback.json")
    );

    const seedHash = await hashTree(workspace);
    const meta = {
      schemaVersion: 1,
      scenarioId,
      policy,
      initialContractVersion: scenario.initialContractVersion,
      targetContractVersion: scenario.targetContractVersion,
      perturbation: scenario.perturbation,
      seedHash,
      workspace: path.relative(root, workspace).split(path.sep).join("/")
    };

    await fs.writeFile(
      path.join(runRoot, "run-meta.json"),
      JSON.stringify(meta, null, 2) + "\n"
    );

    runs.push(meta);
  }
}

await fs.writeFile(
  path.join(outRoot, "index.json"),
  JSON.stringify({ schemaVersion: 1, runs }, null, 2) + "\n"
);

process.stdout.write(`Prepared ${runs.length} checkout incident workspaces.\n`);

