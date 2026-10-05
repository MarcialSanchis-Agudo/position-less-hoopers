import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const manifest = JSON.parse(
  await fs.readFile(path.join(root, "experiments/context-reload/tasks.json"), "utf8")
);
const outArg = process.argv[2] ?? "results/local/context-reload";
const outRoot = path.resolve(root, outArg);
const relativeOut = path.relative(root, outRoot);
if (!relativeOut || relativeOut.startsWith("..") || path.isAbsolute(relativeOut)) {
  throw new Error("Context-reload output directory must stay inside the PLH repository.");
}

function sha256(value) {
  return "sha256:" + crypto.createHash("sha256").update(value).digest("hex");
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

async function hashDirectory(directory) {
  const parts = [];

  async function visit(current, relative = "") {
    const entries = await fs.readdir(current, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      const rel = path.posix.join(relative.split(path.sep).join("/"), entry.name);
      if (entry.isDirectory()) {
        await visit(abs, rel);
      } else {
        const bytes = await fs.readFile(abs);
        parts.push(rel);
        parts.push("\0");
        parts.push(bytes);
        parts.push("\0");
      }
    }
  }

  await visit(directory);
  return sha256(Buffer.concat(parts.map((part) =>
    Buffer.isBuffer(part) ? part : Buffer.from(part)
  )));
}

await fs.rm(outRoot, { recursive: true, force: true });
await fs.mkdir(outRoot, { recursive: true });

const index = [];

for (const task of manifest.tasks) {
  const seed = path.join(root, task.seedPath);
  const context = await fs.readFile(path.join(root, task.contextPath), "utf8");
  const taskPrompt = await fs.readFile(path.join(seed, "TASK.md"), "utf8");
  const seedHash = await hashDirectory(seed);
  const contextPackageHash = sha256(context);
  const taskPromptHash = sha256(taskPrompt);

  for (const condition of ["warm", "cold"]) {
    const workspace = path.join(outRoot, task.taskId, condition, "workspace");
    await copyDir(seed, workspace);

    if (condition === "warm") {
      await fs.writeFile(path.join(workspace, "PLH_CONTEXT.md"), context, "utf8");
    }

    const runMeta = {
      schemaVersion: 1,
      pairId: task.taskId,
      taskId: task.taskId,
      condition,
      workspace: path.relative(root, workspace).split(path.sep).join("/"),
      contextInjected: condition === "warm",
      seedHash,
      taskPromptHash,
      contextPackageHash
    };

    await fs.writeFile(
      path.join(outRoot, task.taskId, condition, "run-meta.json"),
      JSON.stringify(runMeta, null, 2) + "\n",
      "utf8"
    );

    index.push(runMeta);
  }
}

await fs.writeFile(
  path.join(outRoot, "index.json"),
  JSON.stringify({ schemaVersion: 1, runs: index }, null, 2) + "\n",
  "utf8"
);

process.stdout.write(`Prepared ${index.length} warm/cold workspaces in ${outRoot}\n`);

