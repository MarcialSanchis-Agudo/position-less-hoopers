import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const EVAL_PATH = "benchmarks/courtshift/local-json-action-runtime-validation-eval-v0.1.1-qwen35-9b.json";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function gitBlobSha(content) {
  const bytes = Buffer.from(content);
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

export function buildLaunch(config, outArg, environment = process.env) {
  if (config.runtimeValidation?.firstBatchCells !== 5 ||
      config.runtimeValidation?.repeats !== 1 ||
      config.executorFamily?.runtime !== "direct-ollama-structured-json-action-loop") {
    throw new Error("Expected the frozen five-cell JSON-action condition");
  }
  const settings = config.executorFamily.settings;
  return {
    args: [config.runner, EVAL_PATH, config.ontologyConfig, outArg,
      config.executorFamily.adapter, "1", "5"],
    env: {
      ...environment,
      PLH_LOCAL_MODEL: config.executorFamily.defaultModel,
      PLH_LOCAL_PROVIDER: "ollama",
      PLH_OLLAMA_BASE_URL: "http://127.0.0.1:11434",
      PLH_OLLAMA_JSON_MAX_STEPS: String(settings.maxSteps),
      PLH_OLLAMA_NUM_CTX: String(settings.numCtx),
      PLH_OLLAMA_JSON_REQUEST_TIMEOUT_MS: String(settings.requestTimeoutMs),
      PLH_OLLAMA_JSON_TOTAL_TIMEOUT_MS: String(settings.totalTimeoutMs)
    }
  };
}

export async function reserveOutput(root, outArg) {
  const base = await fs.realpath(root);
  const output = path.resolve(base, outArg);
  const relative = path.relative(base, output);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Output must be a new directory inside the repository");
  }
  // Walk parents to reject a symlink before making any output beneath it.
  let parent = base;
  for (const segment of relative.split(path.sep).slice(0, -1)) {
    parent = path.join(parent, segment);
    try {
      const stat = await fs.lstat(parent);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw new Error("Output parent must be a real directory, not a symlink");
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await fs.mkdir(parent);
    }
  }
  // Exclusive mkdir: refuse old evidence, checkpoints, or concurrent invocations.
  await fs.mkdir(output);
  return output;
}

async function main() {
  const outArg = process.argv[2];
  if (!outArg || process.argv.length !== 3) {
    throw new Error("usage: node scripts/run-json-action-runtime-validation.mjs <new-output-directory>");
  }
  const config = JSON.parse(await fs.readFile(path.join(ROOT, EVAL_PATH), "utf8"));
  for (const [relative, expected] of Object.entries(config.executorFamily.runtimeBlobs)) {
    if (gitBlobSha(await fs.readFile(path.join(ROOT, relative))) !== expected) {
      throw new Error(`Frozen runtime file changed: ${relative}`);
    }
  }
  const head = spawnSync("git", ["rev-parse", "HEAD"], {cwd: ROOT, encoding: "utf8"});
  const dirty = spawnSync("git", ["status", "--porcelain", "--untracked-files=no"], {cwd: ROOT, encoding: "utf8"});
  if (head.status !== 0 || dirty.status !== 0 || dirty.stdout.trim()) {
    throw new Error("A clean tracked Git checkout is required; preserve changes, do not force/reset");
  }
  const output = await reserveOutput(ROOT, outArg);
  const launch = buildLaunch(config, path.relative(ROOT, output));
  const pinnedEnv = Object.fromEntries(Object.entries(launch.env).filter(([key]) =>
    ["PLH_LOCAL_MODEL", "PLH_LOCAL_PROVIDER", "PLH_OLLAMA_BASE_URL", "PLH_OLLAMA_JSON_MAX_STEPS",
      "PLH_OLLAMA_NUM_CTX", "PLH_OLLAMA_JSON_REQUEST_TIMEOUT_MS", "PLH_OLLAMA_JSON_TOTAL_TIMEOUT_MS"].includes(key)));
  await fs.writeFile(path.join(output, "json-action-validation-provenance.json"), JSON.stringify({
    schemaVersion: 1, evaluationSetId: config.evaluationSetId,
    sourceCommit: head.stdout.trim(), runtimeSourceCommit: config.executorFamily.runtimeSourceCommit,
    runtimeBlobs: config.executorFamily.runtimeBlobs, pinnedEnvironment: pinnedEnv,
    startedAt: new Date().toISOString(), node: process.version, platform: process.platform,
    arch: process.arch, args: launch.args, developmentOnly: true
  }, null, 2) + "\n", {flag: "wx"});
  const run = spawnSync(process.execPath, launch.args, {cwd: ROOT, env: launch.env, stdio: "inherit"});
  // Summarize partial evidence on infrastructure failure too. Never continue/resume.
  const summary = spawnSync(process.execPath, [path.join(ROOT, "scripts/summarize-json-action-runtime-validation.mjs"), output],
    {cwd: ROOT, encoding: "utf8"});
  if (summary.stdout) process.stdout.write(summary.stdout);
  if (summary.stderr) process.stderr.write(summary.stderr);
  if (run.error) process.stderr.write(`${run.error.message}\n`);
  process.exitCode = run.status !== 0 ? (run.status ?? 1) : (summary.status ?? 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
