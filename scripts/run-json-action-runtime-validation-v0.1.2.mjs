import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { EVAL_PATH, writeSummary } from "./summarize-json-action-runtime-validation-v0.1.2.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "be7083211a4c8ff5eaf97cb27570420c0ca28828";
export function gitBlobSha(bytes) {
  bytes = Buffer.from(bytes);
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}
export function buildLaunchV012(config, outArg, environment = process.env) {
  if (config.evaluationSetId !== "plh-local-json-action-runtime-validation-v0.1.2-qwen35-9b" ||
      config.executorFamily.runtimeSourceCommit !== SOURCE ||
      config.executorFamily.pathContractVersion !== "workspace-relative-v0.1.2" ||
      config.runtimeValidation.firstBatchCells !== 5 || config.runtimeValidation.repeats !== 1) {
    throw new Error("Expected the frozen workspace-relative v0.1.2 condition");
  }
  const s = config.executorFamily.settings;
  return {args: [config.runner, EVAL_PATH, config.ontologyConfig, outArg,
    config.executorFamily.adapter, "1", "5"],
    env: {...environment, PLH_LOCAL_MODEL: config.executorFamily.defaultModel,
      PLH_LOCAL_PROVIDER: "ollama", PLH_OLLAMA_BASE_URL: "http://127.0.0.1:11434",
      PLH_OLLAMA_JSON_MAX_STEPS: String(s.maxSteps), PLH_OLLAMA_NUM_CTX: String(s.numCtx),
      PLH_OLLAMA_JSON_REQUEST_TIMEOUT_MS: String(s.requestTimeoutMs),
      PLH_OLLAMA_JSON_TOTAL_TIMEOUT_MS: String(s.totalTimeoutMs)}};
}
export async function verifyRuntime(root, blobs) {
  for (const [file, expected] of Object.entries(blobs)) {
    if (gitBlobSha(await fs.readFile(path.join(root, file))) !== expected) {
      throw new Error(`Frozen runtime file changed: ${file}`);
    }
  }
}
async function main() {
  if (process.argv.length !== 3) throw new Error("usage: node scripts/run-json-action-runtime-validation-v0.1.2.mjs <new-output-directory>");
  const config = JSON.parse(await fs.readFile(path.join(ROOT, EVAL_PATH), "utf8"));
  const launch = buildLaunchV012(config, process.argv[2]);
  await verifyRuntime(ROOT, config.executorFamily.runtimeBlobs);
  const head = spawnSync("git", ["rev-parse", "HEAD"], {cwd: ROOT, encoding: "utf8"});
  const dirty = spawnSync("git", ["status", "--porcelain", "--untracked-files=no"], {cwd: ROOT, encoding: "utf8"});
  if (head.status !== 0 || dirty.status !== 0 || dirty.stdout.trim()) {
    throw new Error("A clean tracked checkout is required; preserve changes rather than forcing/resetting");
  }
  const { reserveOutput } = await import("./run-json-action-runtime-validation.mjs");
  const output = await reserveOutput(ROOT, process.argv[2]);
  launch.args[3] = path.relative(ROOT, output);
  const keys = ["PLH_LOCAL_MODEL", "PLH_LOCAL_PROVIDER", "PLH_OLLAMA_BASE_URL", "PLH_OLLAMA_JSON_MAX_STEPS",
    "PLH_OLLAMA_NUM_CTX", "PLH_OLLAMA_JSON_REQUEST_TIMEOUT_MS", "PLH_OLLAMA_JSON_TOTAL_TIMEOUT_MS"];
  await fs.writeFile(path.join(output, "json-action-validation-provenance.json"), JSON.stringify({
    schemaVersion: 1, evaluationSetId: config.evaluationSetId, sourceCommit: head.stdout.trim(),
    runtimeSourceCommit: SOURCE, pathContractVersion: config.executorFamily.pathContractVersion,
    runtimeBlobs: config.executorFamily.runtimeBlobs,
    pinnedEnvironment: Object.fromEntries(keys.map((key) => [key, launch.env[key]])),
    startedAt: new Date().toISOString(), node: process.version, platform: process.platform,
    arch: process.arch, args: launch.args, developmentOnly: true, publicationClaimEligible: false
  }, null, 2) + "\n", {flag: "wx"});
  // A new directory and a five-cell cap: never resume the failed v0.1.1 batch.
  const run = spawnSync(process.execPath, launch.args, {cwd: ROOT, env: launch.env, stdio: "inherit"});
  const summary = await writeSummary(output, config);
  console.log(JSON.stringify(summary, null, 2));
  if (run.error) console.error(run.error.message);
  process.exitCode = run.status !== 0 ? (run.status ?? 1) : (summary.runtimeValidationPassed ? 0 : 1);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {console.error(error.message); process.exitCode = 1;});
}
