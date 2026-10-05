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
const policiesArg = process.argv[6] ?? null;

if (!manifestArg || !outArg || !adapterArg || !eventStreamArg) {
  process.stderr.write(
    "usage: node run-event-stream-matrix.mjs <task-pack.json> <outDir> <adapter.json> <event-stream.json> [policies]\n"
  );
  process.exit(2);
}

const prepareScript = path.join(root, "scripts/prepare-task-pack.mjs");
const cellScript = path.join(root, "scripts/run-event-stream-cell.mjs");

const prepareArgs = [prepareScript, manifestArg, outArg];
if (policiesArg) prepareArgs.push(policiesArg);

const prep = spawnSync(
  process.execPath,
  prepareArgs,
  { cwd: root, encoding: "utf8" }
);
if (prep.status !== 0) {
  process.stderr.write(prep.stderr || prep.stdout);
  process.exit(prep.status ?? 1);
}

const outRoot = path.resolve(root, outArg);
const index = JSON.parse(
  await fs.readFile(path.join(outRoot, "index.json"), "utf8")
);

const targetScenario = index.runs.find(
  (run) =>
    run.scenarioKind === "perturbed" &&
    run.initialContractVersion === 1 &&
    run.targetContractVersion === 2
)?.scenarioId;

if (!targetScenario) {
  throw new Error("No v1 -> v2 perturbed scenario found");
}

const rows = [];
for (const run of index.runs.filter(
  (row) => row.scenarioId === targetScenario
)) {
  const runRoot = path.join(outRoot, run.scenarioId, run.policy);

  const proc = spawnSync(
    process.execPath,
    [
      cellScript,
      path.relative(root, runRoot),
      adapterArg,
      eventStreamArg
    ],
    { cwd: root, encoding: "utf8" }
  );

  let record = null;
  try {
    record = JSON.parse(
      await fs.readFile(
        path.join(runRoot, "event-stream-result.json"),
        "utf8"
      )
    );
  } catch {}

  rows.push({
    policy: run.policy,
    processExitCode: proc.status,
    policyRecomputationCount:
      record?.policyRecomputationCount ?? null,
    agentInvocationCount:
      record?.agentInvocationCount ?? null,
    prePerturbationInvocationCount:
      record?.prePerturbationInvocationCount ?? null,
    recoveryAttemptCount:
      record?.recoveryAttemptCount ?? null,
    postRecoveryInvocationCount:
      record?.postRecoveryInvocationCount ?? null,
    redundantInvocationCount:
      record?.redundantInvocationCount ?? null,
    suppressedExecutionCount:
      record?.suppressedExecutionCount ?? 0,
    unnecessaryInvocationCount:
      record?.unnecessaryInvocationCount ?? null,
    recoveryTriggerEventId:
      record?.recoveryTriggerEventId ?? null,
    recoveryTriggerLatencyMs:
      record?.recoveryTriggerLatencyMs ?? null,
    totalAgentExecutionMs:
      Array.isArray(record?.invocations)
        ? record.invocations.reduce(
            (sum, item) => sum + (item.executionDurationMs ?? 0),
            0
          )
        : null,
    prePerturbationAgentExecutionMs:
      record?.prePerturbationAgentExecutionMs ?? null,
    recoveryAttemptAgentExecutionMs:
      record?.recoveryAttemptAgentExecutionMs ?? null,
    postRecoveryAgentExecutionMs:
      record?.postRecoveryAgentExecutionMs ?? null,
    redundantAgentExecutionMs:
      record?.redundantAgentExecutionMs ?? null,
    unnecessaryAgentExecutionMs:
      record?.prePerturbationAgentExecutionMs ?? null,
    finalCorrect:
      record?.finalCorrect ?? false,
    evidenceSatisfied:
      record?.evidenceSatisfied ?? false
  });
}

const summary = {
  schemaVersion: 1,
  taskPackId: index.taskPackId,
  scenarioId: targetScenario,
  eventStream: eventStreamArg,
  adapter: adapterArg,
  rows
};

await fs.writeFile(
  path.join(outRoot, "event-stream-matrix-summary.json"),
  JSON.stringify(summary, null, 2) + "\n"
);

process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
process.exit(rows.some((row) => row.processExitCode == null) ? 1 : 0);

