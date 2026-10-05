import { spawnSync } from "node:child_process";
import { validateExecutionResult } from "./runner-port.mjs";

export function runLocalExecutionRequest(request, {
  command,
  args = [],
  cwd = request.workspace,
  env = {},
  timeoutMs = 120000,
  resultParser
}) {
  if (typeof command !== "string" || command.length === 0) {
    throw new TypeError("LocalRunner requires a command");
  }
  if (typeof resultParser !== "function") {
    throw new TypeError("LocalRunner requires resultParser(processResult, request)");
  }

  const startedAt = new Date().toISOString();
  const startedMs = Date.now();

  const processResult = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      ...env
    },
    timeout: timeoutMs
  });

  const finishedMs = Date.now();
  const finishedAt = new Date().toISOString();

  const result = resultParser(processResult, request);
  const validation = validateExecutionResult(result, request);

  if (!validation.ok) {
    throw new TypeError(
      `LocalRunner produced invalid ExecutionResult: ${validation.errors.join("; ")}`
    );
  }

  return {
    schemaVersion: 1,
    request,
    result,
    telemetry: {
      startedAt,
      finishedAt,
      durationMs: finishedMs - startedMs,
      exitCode: processResult.status,
      signal: processResult.signal ?? null,
      stdout: processResult.stdout ?? "",
      stderr: processResult.stderr ?? "",
      timedOut: processResult.error?.code === "ETIMEDOUT"
    }
  };
}

export function npmTestResultParser(processResult, request) {
  return {
    schemaVersion: 1,
    requestId: request.requestId,
    status: processResult.status === 0 ? "completed" : "failed",
    evidenceRefs: processResult.status === 0
      ? [...request.expectedEvidenceRefs]
      : [],
    summary: processResult.status === 0
      ? "npm test passed"
      : "npm test failed",
    retryable: processResult.status !== 0
  };
}

