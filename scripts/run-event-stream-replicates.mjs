import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const manifestArg = process.argv[2];
const outArg = process.argv[3];
const adapterArg = process.argv[4];
const eventStreamArg = process.argv[5];
const repeats = Number(process.argv[6] ?? 5);
const policiesArg = process.argv[7] ?? null;

if (!manifestArg || !outArg || !adapterArg || !eventStreamArg) {
  process.stderr.write(
    "usage: node run-event-stream-replicates.mjs <task-pack.json> <outDir> <adapter.json> <event-stream.json> [repeats] [policies]\n"
  );
  process.exit(2);
}
if (!Number.isInteger(repeats) || repeats < 1) {
  throw new Error("repeats must be a positive integer");
}

const matrixScript = path.join(root, "scripts/run-event-stream-matrix.mjs");
const outRoot = path.resolve(root, outArg);
await fs.mkdir(outRoot, { recursive: true });

const replicates = [];

for (let i = 1; i <= repeats; i += 1) {
  const repName = `rep-${String(i).padStart(2, "0")}`;
  const repOut = path.join(outArg, repName);

  const matrixArgs = [
    matrixScript,
    manifestArg,
    repOut,
    adapterArg,
    eventStreamArg
  ];
  if (policiesArg) matrixArgs.push(policiesArg);

  const proc = spawnSync(
    process.execPath,
    matrixArgs,
    { cwd: root, encoding: "utf8" }
  );

  const summaryPath = path.join(
    root,
    repOut,
    "event-stream-matrix-summary.json"
  );

  let summary = null;
  try {
    summary = JSON.parse(await fs.readFile(summaryPath, "utf8"));
  } catch {}

  replicates.push({
    replicate: i,
    processExitCode: proc.status,
    summary
  });
}

const policies = [...new Set(
  replicates.flatMap((rep) =>
    rep.summary?.rows?.map((row) => row.policy) ?? []
  )
)].sort();

function stats(values) {
  const nums = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (nums.length === 0) {
    return { n: 0, mean: null, min: null, max: null };
  }
  return {
    n: nums.length,
    mean: nums.reduce((sum, value) => sum + value, 0) / nums.length,
    min: nums[0],
    max: nums.at(-1)
  };
}

const byPolicy = policies.map((policy) => {
  const rows = replicates.flatMap((rep) =>
    (rep.summary?.rows ?? []).filter((row) => row.policy === policy)
  );

  return {
    policy,
    runCount: rows.length,
    successCount: rows.filter(
      (row) => row.finalCorrect && row.evidenceSatisfied
    ).length,
    agentInvocationCount: stats(
      rows.map((row) => row.agentInvocationCount)
    ),
    prePerturbationInvocationCount: stats(
      rows.map((row) => row.prePerturbationInvocationCount)
    ),
    recoveryAttemptCount: stats(
      rows.map((row) => row.recoveryAttemptCount)
    ),
    postRecoveryInvocationCount: stats(
      rows.map((row) => row.postRecoveryInvocationCount)
    ),
    redundantInvocationCount: stats(
      rows.map((row) => row.redundantInvocationCount)
    ),
    suppressedExecutionCount: stats(
      rows.map((row) => row.suppressedExecutionCount)
    ),
    unnecessaryInvocationCount: stats(
      rows.map((row) => row.unnecessaryInvocationCount)
    ),
    totalAgentExecutionMs: stats(
      rows.map((row) => row.totalAgentExecutionMs)
    ),
    prePerturbationAgentExecutionMs: stats(
      rows.map((row) => row.prePerturbationAgentExecutionMs)
    ),
    recoveryAttemptAgentExecutionMs: stats(
      rows.map((row) => row.recoveryAttemptAgentExecutionMs)
    ),
    postRecoveryAgentExecutionMs: stats(
      rows.map((row) => row.postRecoveryAgentExecutionMs)
    ),
    redundantAgentExecutionMs: stats(
      rows.map((row) => row.redundantAgentExecutionMs)
    ),
    unnecessaryAgentExecutionMs: stats(
      rows.map((row) => row.unnecessaryAgentExecutionMs)
    ),
    recoveryTriggerLatencyMs: stats(
      rows.map((row) => row.recoveryTriggerLatencyMs)
    )
  };
});

const aggregate = {
  schemaVersion: 1,
  taskPack: manifestArg,
  adapter: adapterArg,
  eventStream: eventStreamArg,
  repeats,
  replicateCount: replicates.length,
  failedReplicateCount: replicates.filter(
    (rep) => rep.processExitCode !== 0
  ).length,
  byPolicy,
  replicates: replicates.map((rep) => ({
    replicate: rep.replicate,
    processExitCode: rep.processExitCode,
    rows: rep.summary?.rows ?? []
  }))
};

await fs.writeFile(
  path.join(outRoot, "event-stream-replicates-summary.json"),
  JSON.stringify(aggregate, null, 2) + "\n"
);

process.stdout.write(JSON.stringify(aggregate, null, 2) + "\n");
process.exit(aggregate.failedReplicateCount === 0 ? 0 : 1);

