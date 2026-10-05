import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const runner = path.join(root, "scripts/run-orca-ax-assignment-shift.mjs");

const configArg = process.argv[2];
const outArg = process.argv[3];
const adapterArg = process.argv[4];
const repeatsArg = process.argv[5] ?? null;

if (!configArg || !outArg || !adapterArg) {
  process.stderr.write(
    "usage: node run-orca-ax-context-routing-comparison.mjs <config.json> <outDir> <adapter.json> [repeats]\n"
  );
  process.exit(2);
}

const configPath = path.resolve(root, configArg);
const outRoot = path.resolve(root, outArg);
const relativeOut = path.relative(root, outRoot);
if (!relativeOut || relativeOut.startsWith("..") || path.isAbsolute(relativeOut)) {
  throw new Error("output directory must stay inside repository");
}

const config = JSON.parse(await fs.readFile(configPath, "utf8"));
const matcherModes = config.matcherModes ?? ["capability", "capability_situated"];
const repeats = repeatsArg == null ? (config.repeats ?? 5) : Number(repeatsArg);

if (!Number.isInteger(repeats) || repeats < 1) {
  throw new TypeError("repeats must be a positive integer");
}
if (!Array.isArray(matcherModes) || matcherModes.length !== 2) {
  throw new TypeError("context-routing comparison requires exactly two matcher modes");
}

await fs.rm(outRoot, { recursive: true, force: true });
await fs.mkdir(outRoot, { recursive: true });

const records = [];

for (let replicate = 1; replicate <= repeats; replicate += 1) {
  const order = replicate % 2 === 1
    ? matcherModes
    : [...matcherModes].reverse();

  for (const matcherMode of order) {
    const runOut = path.join(
      outRoot,
      `rep-${String(replicate).padStart(2, "0")}`,
      matcherMode
    );

    const proc = spawnSync(
      process.execPath,
      [
        runner,
        configArg,
        path.relative(root, runOut).split(path.sep).join("/"),
        adapterArg,
        matcherMode
      ],
      { cwd: root, encoding: "utf8" }
    );

    if (proc.status !== 0) {
      records.push({
        replicate,
        matcherMode,
        processExitCode: proc.status,
        error: proc.stderr || proc.stdout
      });
      continue;
    }

    const summary = JSON.parse(
      await fs.readFile(
        path.join(runOut, "orca-ax-assignment-shift-summary.json"),
        "utf8"
      )
    );

    records.push({
      replicate,
      matcherMode,
      processExitCode: proc.status,
      assignmentSequence: summary.assignmentSequence,
      contextMisalignedAssignmentCount:
        summary.contextMisalignedAssignmentCount,
      finalCorrect: summary.finalCorrect,
      evidenceSatisfied: summary.evidenceSatisfied,
      firstRecoveryAgentExecutionMs:
        summary.firstRecoveryAgentExecutionMs,
      totalAgentExecutionMs: summary.totalAgentExecutionMs,
      suppressedExecutionCount: summary.suppressedExecutionCount,
      agentInvocationCount: summary.agentInvocationCount
    });
  }
}

function stats(values) {
  const numeric = values.filter(Number.isFinite);
  if (!numeric.length) {
    return { n: 0, mean: null, min: null, max: null };
  }
  return {
    n: numeric.length,
    mean: numeric.reduce((sum, value) => sum + value, 0) / numeric.length,
    min: Math.min(...numeric),
    max: Math.max(...numeric)
  };
}

const byMatcherMode = matcherModes.map((matcherMode) => {
  const rows = records.filter(
    (record) =>
      record.matcherMode === matcherMode &&
      record.processExitCode === 0
  );

  return {
    matcherMode,
    runCount: rows.length,
    successCount: rows.filter((row) => row.finalCorrect).length,
    evidenceSatisfiedCount: rows.filter((row) => row.evidenceSatisfied).length,
    assignmentSequences: rows.map((row) => row.assignmentSequence),
    contextMisalignedAssignmentCount: stats(
      rows.map((row) => row.contextMisalignedAssignmentCount)
    ),
    firstRecoveryAgentExecutionMs: stats(
      rows.map((row) => row.firstRecoveryAgentExecutionMs)
    ),
    totalAgentExecutionMs: stats(
      rows.map((row) => row.totalAgentExecutionMs)
    ),
    suppressedExecutionCount: stats(
      rows.map((row) => row.suppressedExecutionCount)
    ),
    agentInvocationCount: stats(
      rows.map((row) => row.agentInvocationCount)
    )
  };
});

const capability = byMatcherMode.find(
  (row) => row.matcherMode === "capability"
);
const situated = byMatcherMode.find(
  (row) => row.matcherMode === "capability_situated"
);

const comparison = {
  firstRecoveryAgentExecutionMs:
    capability?.firstRecoveryAgentExecutionMs.mean != null &&
    situated?.firstRecoveryAgentExecutionMs.mean != null
      ? {
          capabilityMinusSituated:
            capability.firstRecoveryAgentExecutionMs.mean -
            situated.firstRecoveryAgentExecutionMs.mean
        }
      : null,
  totalAgentExecutionMs:
    capability?.totalAgentExecutionMs.mean != null &&
    situated?.totalAgentExecutionMs.mean != null
      ? {
          capabilityMinusSituated:
            capability.totalAgentExecutionMs.mean -
            situated.totalAgentExecutionMs.mean
        }
      : null
};

const output = {
  schemaVersion: 1,
  experimentId: config.experimentId,
  repeats,
  failedRunCount: records.filter((record) => record.processExitCode !== 0).length,
  matcherModes,
  byMatcherMode,
  comparison,
  records
};

await fs.writeFile(
  path.join(outRoot, "orca-ax-context-routing-comparison-summary.json"),
  JSON.stringify(output, null, 2) + "\n"
);

process.stdout.write(JSON.stringify(output, null, 2) + "\n");
