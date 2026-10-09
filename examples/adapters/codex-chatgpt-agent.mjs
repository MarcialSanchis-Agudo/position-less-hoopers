import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildCodexExecArgs } from "./codex-cli-args.mjs";

const requestPath = process.env.PLH_EXECUTION_REQUEST;
const resultPath = process.env.PLH_EXECUTION_RESULT;
const workspace = process.env.PLH_WORKSPACE;
const instructionsPath = process.env.PLH_AGENT_INSTRUCTIONS;
const runRoot = process.env.PLH_RUN_ROOT || workspace;
const codexBin = process.env.CODEX_BIN || "codex";

if (!requestPath || !resultPath || !workspace || !instructionsPath) {
  process.stderr.write("Missing PLH execution environment variables\n");
  process.exit(2);
}

const request = JSON.parse(await fs.readFile(requestPath, "utf8"));
const instructions = await fs.readFile(instructionsPath, "utf8");

const prompt = `${instructions}

## Experimental isolation rules

- Work only inside the current workspace.
- Do not read parent or sibling directories.
- Do not search for reference solutions, previous runs, grader source, or hidden tests.
- Do not modify TASK.md, contract files, state files, or test files.
- You may inspect authoritative workspace files needed to solve the task.
- You may edit implementation files.
- Run npm test before finishing.
- Do not use network access.
- Stop after the implementation is complete or when genuinely blocked.
- Do not invent grader evidence.
- The PLH wrapper owns execution-request.json and execution-result.json.
`;

const requestedModel =
  process.env.PLH_CODEX_MODEL || "gpt-5.6-terra";
const requestedEffort =
  process.env.PLH_CODEX_EFFORT || "medium";

const codexArgs = buildCodexExecArgs({
  prompt,
  model: requestedModel,
  effort: requestedEffort
});

const versionResult = spawnSync(
  codexBin,
  ["--version"],
  {
    cwd: workspace,
    encoding: "utf8",
    env: process.env,
    timeout: 30000
  }
);

const startedAt = new Date().toISOString();
const startedMs = Date.now();

const codex = spawnSync(
  codexBin,
  codexArgs,
  {
    cwd: workspace,
    encoding: "utf8",
    env: {
      ...process.env,
      PLH_CODEX_FRESH_SESSION: "1"
    },
    timeout: Number(
      process.env.PLH_AGENT_TIMEOUT_MS || 600000
    )
  }
);

const tests = spawnSync(
  "npm",
  ["test"],
  {
    cwd: workspace,
    encoding: "utf8",
    env: process.env,
    timeout: 120000
  }
);

const finishedMs = Date.now();
const status =
  codex.status === 0 && tests.status === 0
    ? "completed"
    : "failed";

const result = {
  schemaVersion: 1,
  requestId: request.requestId,
  status,
  evidenceRefs: [],
  summary:
    status === "completed"
      ? "OpenAI Codex completed the task and public tests pass; authoritative evidence requires the external grader."
      : "OpenAI Codex or the public test suite returned a non-zero exit status.",
  retryable: status !== "completed"
};

await fs.writeFile(
  resultPath,
  JSON.stringify(result, null, 2) + "\n"
);

const telemetry = {
  schemaVersion: 1,
  provider: "OpenAI",
  cli: "Codex CLI",
  cliVersion:
    versionResult.status === 0
      ? String(versionResult.stdout || "").trim()
      : null,
  authMode: "chatgpt-account",
  requestedModel,
  requestedEffort,
  freshSession: true,
  startedAt,
  finishedAt: new Date().toISOString(),
  durationMs: finishedMs - startedMs,
  agentExitCode: codex.status,
  agentSignal: codex.signal ?? null,
  agentStdout: codex.stdout ?? "",
  agentStderr: codex.stderr ?? "",
  publicTestExitCode: tests.status,
  publicTestStdout: tests.stdout ?? "",
  publicTestStderr: tests.stderr ?? ""
};

await fs.writeFile(
  path.join(runRoot, "provider-wrapper-telemetry.json"),
  JSON.stringify(telemetry, null, 2) + "\n"
);

if (codex.stdout) process.stdout.write(codex.stdout);
if (codex.stderr) process.stderr.write(codex.stderr);

process.exit(status === "completed" ? 0 : 1);
