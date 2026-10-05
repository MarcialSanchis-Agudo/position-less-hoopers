import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const requestPath = process.env.PLH_EXECUTION_REQUEST;
const resultPath = process.env.PLH_EXECUTION_RESULT;
const workspace = process.env.PLH_WORKSPACE;
const instructionsPath = process.env.PLH_AGENT_INSTRUCTIONS;
const claudeBin = process.env.CLAUDE_BIN || "claude";

let claudePrefixArgs = [];
if (process.env.CLAUDE_PREFIX_ARGS_JSON) {
  try {
    const parsed = JSON.parse(process.env.CLAUDE_PREFIX_ARGS_JSON);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      claudePrefixArgs = parsed;
    }
  } catch {}
}

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
- Do not modify TASK.md, contract files, or test files.
- You may inspect and edit implementation files.
- Run npm test before finishing.
- Stop after the implementation is complete or when genuinely blocked.
- Do not invent grader evidence.
- Do not create or edit execution-request.json or execution-result.json; the PLH wrapper owns the protocol files.
`;

const claudeArgs = [
  ...claudePrefixArgs,
  "-p",
  prompt,
  "--allowedTools",
  "Read,Edit,Write,Glob,Grep,Bash(npm test)"
];

if (process.env.PLH_CLAUDE_MODEL) {
  claudeArgs.push("--model", process.env.PLH_CLAUDE_MODEL);
}

if (process.env.PLH_CLAUDE_EFFORT) {
  claudeArgs.push("--effort", process.env.PLH_CLAUDE_EFFORT);
}

const versionResult = spawnSync(
  claudeBin,
  [...claudePrefixArgs, "--version"],
  {
    cwd: workspace,
    encoding: "utf8",
    env: process.env,
    timeout: 30000
  }
);

const startedAt = new Date().toISOString();
const startedMs = Date.now();

const claude = spawnSync(claudeBin, claudeArgs, {
  cwd: workspace,
  encoding: "utf8",
  env: {
    ...process.env,
    PLH_CLAUDE_FRESH_SESSION: "1"
  },
  timeout: Number(process.env.PLH_AGENT_TIMEOUT_MS || 600000)
});

const tests = spawnSync("npm", ["test"], {
  cwd: workspace,
  encoding: "utf8",
  env: process.env,
  timeout: 120000
});

const finishedMs = Date.now();
const status =
  claude.status === 0 && tests.status === 0
    ? "completed"
    : "failed";

const result = {
  schemaVersion: 1,
  requestId: request.requestId,
  status,
  evidenceRefs: [],
  summary:
    status === "completed"
      ? "Claude Code completed the task and public tests pass; authoritative evidence requires the external grader."
      : "Claude Code or the public test suite returned a non-zero exit status.",
  retryable: status !== "completed"
};

await fs.writeFile(
  resultPath,
  JSON.stringify(result, null, 2) + "\n"
);

const telemetry = {
  schemaVersion: 1,
  provider: "Anthropic",
  cli: "Claude Code",
  cliVersion:
    versionResult.status === 0
      ? String(versionResult.stdout || "").trim()
      : null,
  requestedModel: process.env.PLH_CLAUDE_MODEL || null,
  requestedEffort: process.env.PLH_CLAUDE_EFFORT || null,
  freshSession: true,
  startedAt,
  finishedAt: new Date().toISOString(),
  durationMs: finishedMs - startedMs,
  claudeExitCode: claude.status,
  claudeSignal: claude.signal ?? null,
  claudeStdout: claude.stdout ?? "",
  claudeStderr: claude.stderr ?? "",
  publicTestExitCode: tests.status,
  publicTestStdout: tests.stdout ?? "",
  publicTestStderr: tests.stderr ?? ""
};

await fs.writeFile(
  path.join(
    process.env.PLH_RUN_ROOT || workspace,
    "claude-wrapper-telemetry.json"
  ),
  JSON.stringify(telemetry, null, 2) + "\n"
);

if (claude.stdout) process.stdout.write(claude.stdout);
if (claude.stderr) process.stderr.write(claude.stderr);

process.exit(status === "completed" ? 0 : 1);

