import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { validateExecutionResult } from "./runner-port.mjs";

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateCommandAgentAdapter(adapter) {
  const errors = [];
  if (!adapter || typeof adapter !== "object" || Array.isArray(adapter)) {
    return { ok: false, errors: ["adapter must be an object"] };
  }
  if (adapter.schemaVersion !== 1) errors.push("schemaVersion must equal 1");
  if (!nonEmptyString(adapter.adapterId)) errors.push("adapterId must be a non-empty string");
  if (!nonEmptyString(adapter.command)) errors.push("command must be a non-empty string");
  if (adapter.args != null &&
      (!Array.isArray(adapter.args) || !adapter.args.every((item) => typeof item === "string"))) {
    errors.push("args must be an array of strings when present");
  }
  if (adapter.timeoutMs != null &&
      (!Number.isInteger(adapter.timeoutMs) || adapter.timeoutMs < 1)) {
    errors.push("timeoutMs must be a positive integer when present");
  }
  if (adapter.env != null &&
      (typeof adapter.env !== "object" || Array.isArray(adapter.env) ||
       !Object.values(adapter.env).every((value) => typeof value === "string"))) {
    errors.push("env must be a string map when present");
  }
  return { ok: errors.length === 0, errors };
}

function instructionsFor(request, resultPath) {
  return [
    "# PLH Execution Assignment",
    "",
    "Work only inside the provided workspace.",
    "",
    "## Objective",
    request.need.objective,
    "",
    "## Rationale",
    request.need.rationale,
    "",
    "## Task instruction",
    request.taskInstruction,
    "",
    "## Authority",
    "Your allowed execution authority is encoded in execution-request.json.",
    "",
    "## Evidence obligations",
    ...(request.expectedEvidenceRefs.length
      ? request.expectedEvidenceRefs.map((ref) => `- ${ref}`)
      : ["- none"]),
    "",
    "## Completion protocol",
    `Before exiting, write a valid PLH ExecutionResult JSON object to: ${resultPath}`,
    "",
    "Allowed status values: completed, blocked, failed.",
    "Do not claim evidence that was not actually produced.",
    ""
  ].join("\n");
}

export async function runCommandAgent(request, adapter, {
  runRoot,
  timeoutMs = adapter?.timeoutMs ?? 120000
}) {
  const validation = validateCommandAgentAdapter(adapter);
  if (!validation.ok) {
    throw new TypeError(`Invalid CommandAgent adapter: ${validation.errors.join("; ")}`);
  }
  if (!nonEmptyString(runRoot)) {
    throw new TypeError("runRoot must be a non-empty string");
  }

  const absRunRoot = path.resolve(runRoot);
  await fs.mkdir(absRunRoot, { recursive: true });

  const requestPath = path.join(absRunRoot, "execution-request.json");
  const instructionsPath = path.join(absRunRoot, "agent-instructions.md");
  const resultPath = path.join(absRunRoot, "execution-result.json");

  await fs.rm(resultPath, { force: true });
  await fs.writeFile(requestPath, JSON.stringify(request, null, 2) + "\n");
  await fs.writeFile(instructionsPath, instructionsFor(request, resultPath), "utf8");

  const startedAt = new Date().toISOString();
  const startedMs = Date.now();

  const processResult = spawnSync(adapter.command, adapter.args ?? [], {
    cwd: request.workspace,
    encoding: "utf8",
    env: {
      ...process.env,
      ...(adapter.env ?? {}),
      PLH_EXECUTION_REQUEST: requestPath,
      PLH_EXECUTION_RESULT: resultPath,
      PLH_WORKSPACE: request.workspace,
      PLH_RUN_ROOT: absRunRoot,
      PLH_AGENT_INSTRUCTIONS: instructionsPath
    },
    timeout: timeoutMs
  });

  const finishedMs = Date.now();
  const finishedAt = new Date().toISOString();

  let result;
  let resultReadError = null;
  try {
    result = JSON.parse(await fs.readFile(resultPath, "utf8"));
  } catch (error) {
    resultReadError = error instanceof Error ? error.message : String(error);
    result = {
      schemaVersion: 1,
      requestId: request.requestId,
      status: "failed",
      evidenceRefs: [],
      summary: "Command agent did not produce a valid execution-result.json",
      retryable: false
    };
  }

  const resultValidation = validateExecutionResult(result, request);
  if (!resultValidation.ok) {
    throw new TypeError(
      `CommandAgent produced invalid ExecutionResult: ${resultValidation.errors.join("; ")}`
    );
  }

  const telemetry = {
    adapterId: adapter.adapterId,
    startedAt,
    finishedAt,
    durationMs: finishedMs - startedMs,
    exitCode: processResult.status,
    signal: processResult.signal ?? null,
    timedOut: processResult.error?.code === "ETIMEDOUT",
    stdout: processResult.stdout ?? "",
    stderr: processResult.stderr ?? "",
    resultReadError
  };

  await fs.writeFile(
    path.join(absRunRoot, "agent-telemetry.json"),
    JSON.stringify(telemetry, null, 2) + "\n"
  );

  return {
    schemaVersion: 1,
    request,
    result,
    telemetry
  };
}

