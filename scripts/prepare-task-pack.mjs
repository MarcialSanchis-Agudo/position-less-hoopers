import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeTaskPackManifest, validateTaskScenario } from "../src/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const manifestArg = process.argv[2];
const outArg = process.argv[3];
const policiesArg = process.argv[4] ?? "static,greedy,plh_direct,plh_pressure";

if (!manifestArg || !outArg) {
  process.stderr.write("usage: node prepare-task-pack.mjs <task-pack.json> <outDir> [policies]\n");
  process.exit(2);
}

const manifestPath = path.resolve(root, manifestArg);
const packRoot = path.dirname(manifestPath);
const manifest = normalizeTaskPackManifest(
  JSON.parse(await fs.readFile(manifestPath, "utf8"))
);
const policies = [...new Set(policiesArg.split(",").map((v) => v.trim()).filter(Boolean))];
const outRoot = path.resolve(root, outArg);
const relativeOut = path.relative(root, outRoot);

if (!relativeOut || relativeOut.startsWith("..") || path.isAbsolute(relativeOut)) {
  throw new Error("output directory must stay inside repository");
}
if (policies.length === 0) throw new Error("at least one policy is required");

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
      else {
        chunks.push(Buffer.from(rel));
        chunks.push(await fs.readFile(full));
      }
    }
  }
  await walk(dir);
  return "sha256:" + crypto.createHash("sha256")
    .update(Buffer.concat(chunks))
    .digest("hex");
}

const scenarios = [];
for (const rel of manifest.scenarioFiles) {
  const scenario = JSON.parse(await fs.readFile(path.join(packRoot, rel), "utf8"));
  const validation = validateTaskScenario(scenario);
  if (!validation.ok) {
    throw new TypeError(`Invalid scenario ${rel}: ${validation.errors.join("; ")}`);
  }
  scenarios.push(scenario);
}

await fs.rm(outRoot, { recursive: true, force: true });
await fs.mkdir(outRoot, { recursive: true });

const runs = [];
for (const scenario of scenarios) {
  const contractRel = manifest.contracts[String(scenario.initialContractVersion)];
  if (!contractRel) {
    throw new Error(`No contract for version ${scenario.initialContractVersion}`);
  }

  for (const policy of policies) {
    const runRoot = path.join(outRoot, scenario.scenarioId, policy);
    const workspace = path.join(runRoot, "workspace");

    await copyDir(path.join(packRoot, manifest.seedPath), workspace);

    const activeContract = path.join(workspace, manifest.activeContractPath);
    await fs.mkdir(path.dirname(activeContract), { recursive: true });
    await fs.copyFile(path.join(packRoot, contractRel), activeContract);

    const seedHash = await hashTree(workspace);
    const meta = {
      schemaVersion: 1,
      taskPackId: manifest.taskPackId,
      taskPackVersion: manifest.version,
      scenarioId: scenario.scenarioId,
      scenarioKind: scenario.kind,
      policy,
      initialContractVersion: scenario.initialContractVersion,
      targetContractVersion: scenario.targetContractVersion,
      perturbation: scenario.perturbation ?? null,
      seedHash,
      workspace: path.relative(root, workspace).split(path.sep).join("/"),
      manifestPath: path.relative(root, manifestPath).split(path.sep).join("/")
    };

    await fs.mkdir(runRoot, { recursive: true });
    await fs.writeFile(
      path.join(runRoot, "run-meta.json"),
      JSON.stringify(meta, null, 2) + "\n"
    );
    runs.push(meta);
  }
}

await fs.writeFile(
  path.join(outRoot, "index.json"),
  JSON.stringify({
    schemaVersion: 1,
    taskPackId: manifest.taskPackId,
    policies,
    runs
  }, null, 2) + "\n"
);

process.stdout.write(
  `Prepared ${runs.length} runs for TaskPack ${manifest.taskPackId}.\n`
);

