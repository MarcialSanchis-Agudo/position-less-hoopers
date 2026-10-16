// Read-only task diagnostic: reconstruct the failed B1 input, optionally request
// ONE new response, and save raw bytes. Never execute an emitted action or grader.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";

export const FROZEN_COMMIT = "f2601deb6222c7fde1eb64d254a50a6001efe375";
export const LOOP_SHA = "fc885fc29ad78f80cab5911ac5e1d67d35fcade3";
const EVAL_PATH = "benchmarks/courtshift/local-json-action-runtime-validation-eval-v0.1.2-qwen35-9b.json";
const EVAL_SHA = "119b699eb3dd87378ef74b1cd604648f14ffc2de";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export function gitBlobSha(bytes) {
  bytes = Buffer.from(bytes);
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}
function requireThat(ok, message) { if (!ok) throw new Error(message); }

// Parse only known, hash-verified constant literals; no eval or workspace imports.
export function frozenRequestTemplate(source, prompt) {
  requireThat(gitBlobSha(source) === LOOP_SHA, "Frozen JSON loop bytes do not match");
  requireThat(typeof prompt === "string" && prompt.length > 0, "Missing saved prompt");
  const system = source.match(/role: "system",\s+content: \[([\s\S]*?)\]\.join\("\\n"\)/);
  const user = source.match(/role: "user",\s+content: \[([\s\S]*?)\]\.join\("\\n"\)/);
  const schema = source.match(/export const OLLAMA_JSON_ACTION_SCHEMA = Object.freeze\((\{[\s\S]*?\n\})\);/);
  requireThat(system && user && schema, "Frozen message layout not recognized");
  const userLiteral = user[1].replace(/^\s*prompt\s*,/, () => `${JSON.stringify(prompt)},`);
  return {
    messages: [
      {role: "system", content: JSON.parse(`[${system[1]}]`).join("\n")},
      {role: "user", content: JSON.parse(`[${userLiteral}]`).join("\n")}
    ],
    format: JSON.parse(schema[1].replace(/([{,]\s*)([A-Za-z_$][\w$]*)(\s*:)/g, '$1"$2"$3'))
  };
}
export function reconstructRequest(source, prompt, telemetry, config) {
  const n = telemetry?.actionCount;
  requireThat(telemetry?.failure === "structured_request_failed" &&
    telemetry?.agentCompleted === false && telemetry?.lastRequest?.status === "failed" &&
    String(telemetry?.agentError).startsWith("Ollama structured-action response was not valid JSON:"),
    "Expected the saved terminal message-content JSON parse failure");
  requireThat(Number.isSafeInteger(n) && n >= 0 && n < config.executorFamily.settings.maxSteps &&
    telemetry.requestCount === n + 1 && telemetry.lastRequest.index === n + 1 &&
    telemetry.lastRequest.step === n + 1, "Request/action accounting does not match a single failed next request");
  requireThat(telemetry.requestedModel === config.executorFamily.defaultModel &&
    telemetry.cli === config.executorFamily.client &&
    telemetry.pathContractVersion === config.executorFamily.pathContractVersion,
    "Saved runtime/model/path-contract mismatch");
  requireThat(Number.isSafeInteger(telemetry.lastRequest.timeoutMs) && telemetry.lastRequest.timeoutMs > 0,
    "Missing original request timeout");
  requireThat(Array.isArray(telemetry.transcript) && telemetry.transcript.length === 2 * n,
    "Incomplete or unexpected saved transcript");
  const {messages, format} = frozenRequestTemplate(source, prompt);
  for (let i = 0; i < n; i += 1) {
    const a = telemetry.transcript[2 * i]; const r = telemetry.transcript[2 * i + 1];
    requireThat(a?.step === i + 1 && r?.step === i + 1 && a.action &&
      format.properties.action.enum.includes(a.action.action) && a.action.action !== "finish" &&
      r.actionResult && typeof r.actionResult.ok === "boolean", "Transcript action/result order is not replayable");
    messages.push({role: "assistant", content: JSON.stringify(a.action)});
    messages.push({role: "user", content: [
      `RESULT for ${a.action.action}:`, JSON.stringify(r.actionResult), "", "Choose the next JSON action."
    ].join("\n")});
  }
  return {model: telemetry.requestedModel, messages, stream: false, think: false, format,
    options: {num_ctx: config.executorFamily.settings.numCtx, temperature: 0}};
}
export function localBase(value) {
  const url = new URL(value);
  requireThat(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
    !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash,
    "Diagnostic endpoint must be a local HTTP Ollama origin");
  return url.origin;
}
export async function reserveOutput(root, outArg, sourceRun) {
  const base = await fs.realpath(root); const output = path.resolve(base, outArg);
  const rel = path.relative(base, output); const sourceRel = path.relative(sourceRun, output);
  requireThat(rel && rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel),
    "Diagnostic output must be inside this repository");
  requireThat(sourceRel === ".." || sourceRel.startsWith(`..${path.sep}`) || path.isAbsolute(sourceRel),
    "Do not write diagnostic output into the existing run");
  let parent = base;
  for (const segment of rel.split(path.sep).slice(0, -1)) {
    parent = path.join(parent, segment);
    try {
      const stat = await fs.lstat(parent);
      requireThat(stat.isDirectory() && !stat.isSymbolicLink(), "Symlink output parents are not permitted");
    } catch (error) { if (error.code !== "ENOENT") throw error; await fs.mkdir(parent); }
  }
  await fs.mkdir(output); // Exclusive: never erase/reuse an attempt.
  return output;
}
export async function captureOnce(url, {body = null, timeoutMs = 120000, maxBytes = 2097152} = {}) {
  const controller = new AbortController(); const started = Date.now(); const chunks = [];
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let status = null; let contentType = null; let complete = false; let bytes = 0; let error = null;
  try {
    const response = await fetch(url, {method: body == null ? "GET" : "POST", redirect: "error",
      headers: body == null ? {} : {"content-type": "application/json"},
      ...(body == null ? {} : {body}), signal: controller.signal});
    status = response.status; contentType = response.headers.get("content-type");
    for await (const chunk of response.body) {
      const available = maxBytes - bytes;
      chunks.push(Buffer.from(chunk).subarray(0, available));
      bytes += Math.min(chunk.length, available);
      if (chunk.length > available) { controller.abort(); throw new Error("response_capture_limit_exceeded"); }
    }
    complete = true;
  } catch (caught) {
    error = caught.message === "response_capture_limit_exceeded" ? caught.message :
      controller.signal.aborted ? "request_timeout" : String(caught.message ?? caught);
  } finally { clearTimeout(timer); }
  return {status, contentType, complete, error, durationMs: Date.now() - started,
    raw: Buffer.concat(chunks)};
}
export function inspectResponse(capture, schema) {
  const report = {httpStatus: capture.status, contentType: capture.contentType, responseComplete: capture.complete,
    transportError: capture.error, responseBytes: capture.raw.length,
    envelopeValidJson: false, messageValidJson: false, actionNameAllowed: false,
    fullActionSchemaValidated: false, actionExecuted: false,
    done: null, doneReason: null, parseError: null};
  let envelope; let content = null;
  try { envelope = JSON.parse(capture.raw.toString("utf8")); report.envelopeValidJson = true; }
  catch (error) { report.parseError = `envelope: ${error.message}`; return {report, content}; }
  report.done = envelope?.done ?? null; report.doneReason = envelope?.done_reason ?? null;
  report.responseModel = envelope?.model ?? null;
  report.promptEvalCount = envelope?.prompt_eval_count ?? null; report.evalCount = envelope?.eval_count ?? null;
  content = typeof envelope?.message?.content === "string" ? envelope.message.content : null;
  if (content == null) { report.parseError = "Missing string message.content"; return {report, content}; }
  report.contentChars = content.length; report.contentBytes = Buffer.byteLength(content);
  report.contentPrefix = content.slice(0, 240); report.contentSuffix = content.slice(-240);
  try {
    const action = JSON.parse(content); report.messageValidJson = true;
    report.actionNameAllowed = action != null && typeof action === "object" && !Array.isArray(action) &&
      schema.properties.action.enum.includes(action.action);
    report.selectedAction = typeof action?.action === "string" ? action.action : null;
  } catch (error) { report.parseError = `message.content: ${error.message}`; }
  return {report, content};
}
async function json(file) { return JSON.parse(await fs.readFile(file, "utf8")); }
async function saveJson(output, name, value) {
  await fs.writeFile(path.join(output, name), JSON.stringify(value, null, 2) + "\n", {flag: "wx"});
}
async function main() {
  const [runArg, outArg, flag] = process.argv.slice(2);
  requireThat(runArg && outArg && process.argv.length <= 5 && (flag == null || flag === "--send-once"),
    "usage: node scripts/probe-json-action-failed-request.mjs <v0.1.2-runDir> <new-outputDir> [--send-once]");
  const run = await fs.realpath(path.resolve(ROOT, runArg)); const rel = path.relative(ROOT, run);
  requireThat(rel && rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel), "Input run must be inside repository");
  const configBytes = await fs.readFile(path.join(ROOT, EVAL_PATH));
  requireThat(gitBlobSha(configBytes) === EVAL_SHA, "Frozen evaluation configuration changed");
  const config = JSON.parse(configBytes.toString("utf8"));
  for (const [file, expected] of Object.entries(config.executorFamily.runtimeBlobs)) {
    requireThat(gitBlobSha(await fs.readFile(path.join(ROOT, file))) === expected, `Frozen source changed: ${file}`);
  }
  const provenance = await json(path.join(run, "json-action-validation-provenance.json"));
  const checkpoint = await json(path.join(run, "ontology-stress-checkpoint.json"));
  requireThat(provenance.sourceCommit === FROZEN_COMMIT && provenance.evaluationSetId === config.evaluationSetId &&
    isDeepStrictEqual(provenance.runtimeBlobs, config.executorFamily.runtimeBlobs), "Original run provenance mismatch");
  const s = config.executorFamily.settings; const env = provenance.pinnedEnvironment;
  for (const [key, expected] of Object.entries({PLH_LOCAL_MODEL: config.executorFamily.defaultModel,
    PLH_OLLAMA_JSON_MAX_STEPS: String(s.maxSteps), PLH_OLLAMA_NUM_CTX: String(s.numCtx),
    PLH_OLLAMA_JSON_REQUEST_TIMEOUT_MS: String(s.requestTimeoutMs), PLH_OLLAMA_JSON_TOTAL_TIMEOUT_MS: String(s.totalTimeoutMs)})) {
    requireThat(env?.[key] === expected, `Original setting mismatch: ${key}`);
  }
  requireThat(checkpoint.nextCellIndex === 1 && checkpoint.infrastructureFailures?.length === 1 &&
    checkpoint.infrastructureFailures[0].baselineId === "B1", "Expected the original B1-paused batch");
  const cellDir = (index, baseline) => path.join(run, "cells", index,
    "artifact-lineage-incident", "artifact-lineage-clean-v2", baseline);
  const executionRoot = path.join(cellDir("001", "B1"), "execution");
  const telemetry = await json(path.join(executionRoot, "provider-wrapper-telemetry.json"));
  const savedPrompt = await fs.readFile(path.join(executionRoot, "json-action-agent-prompt.md"), "utf8");
  requireThat(savedPrompt.endsWith("\n"), "Saved prompt is missing the adapter's final newline");
  const source = await fs.readFile(path.join(ROOT, "src/ollama-json-action-loop.mjs"), "utf8");
  const request = reconstructRequest(source, savedPrompt.slice(0, -1), telemetry, config);
  const baseUrl = localBase(telemetry.baseUrl);
  requireThat(baseUrl === localBase(env.PLH_OLLAMA_BASE_URL), "Original endpoint mismatch");
  const output = await reserveOutput(ROOT, outArg, run);
  const requestText = JSON.stringify(request);
  await fs.writeFile(path.join(output, "request.json"), requestText, {flag: "wx"});
  const b0 = await json(path.join(cellDir("000", "B0"), "ontology-stress-cell-result.json"));
  const b0Telemetry = await json(path.join(cellDir("000", "B0"), "execution/provider-wrapper-telemetry.json"));
  await saveJson(output, "b0-review.json", {status: b0.status, final: b0.final ?? null,
    finalContent: b0Telemetry.finalContent ?? null,
    actions: (b0Telemetry.transcript ?? []).filter((x) => x.action).map((x) => ({step: x.step, action: x.action}))});
  const summary = {schemaVersion: 1, developmentOnly: true, publicationClaimEligible: false,
    mode: flag === "--send-once" ? "single_request_diagnostic" : "offline_prepare_only",
    sourceRun: run, originalSourceCommit: FROZEN_COMMIT, originalRequestIndex: telemetry.lastRequest.index,
    originalResponseRecovered: false, originalErrorExcerpt: telemetry.agentError,
    sameModelDigestAsOriginal: null, requestSha256: sha256(requestText),
    requestCount: 0, emittedActionsExecuted: 0, gradersRun: 0, outputDir: output,
    originalInputHashes: {savedPrompt: sha256(savedPrompt),
      telemetry: sha256(await fs.readFile(path.join(executionRoot, "provider-wrapper-telemetry.json")))},
    originalB0: {status: b0.status, finalCorrect: b0.final?.correct ?? null,
      evidenceSatisfied: b0.final?.evidenceSatisfied ?? null, finalContent: b0Telemetry.finalContent ?? null}};
  await saveJson(output, "probe-start.json", summary);
  if (flag === "--send-once") {
    // Metadata reads do not execute a model. Save only the selected model entry.
    const version = await captureOnce(`${baseUrl}/api/version`, {timeoutMs: 10000, maxBytes: 65536});
    const tags = await captureOnce(`${baseUrl}/api/tags`, {timeoutMs: 10000});
    const metadata = {observedAt: new Date().toISOString(), versionHttpStatus: version.status, tagsHttpStatus: tags.status,
      versionError: version.error, tagsError: tags.error};
    try { metadata.ollamaVersion = JSON.parse(version.raw.toString("utf8")).version ?? null; } catch {}
    try { metadata.model = JSON.parse(tags.raw.toString("utf8")).models?.find((x) => x.name === request.model || x.model === request.model) ?? null; } catch {}
    await saveJson(output, "environment-now.json", metadata);
    summary.ollamaVersion = metadata.ollamaVersion ?? null; summary.modelDigestNow = metadata.model?.digest ?? null;
    summary.requestCount = 1;
    const capture = await captureOnce(`${baseUrl}/api/chat`, {body: requestText,
      timeoutMs: Math.min(s.requestTimeoutMs, telemetry.lastRequest.timeoutMs)});
    await fs.writeFile(path.join(output, "response-body.raw"), capture.raw, {flag: "wx"});
    const {report, content} = inspectResponse(capture, request.format);
    if (content != null) await fs.writeFile(path.join(output, "message-content.txt"), content, {flag: "wx"});
    summary.responseSha256 = sha256(capture.raw); summary.durationMs = capture.durationMs;
    summary.response = report;
  }
  await saveJson(output, "probe-summary.json", summary);
  console.log(JSON.stringify(summary, null, 2));
  // Parseable output is NOT a task pass; this exit code describes capture only.
  process.exitCode = summary.response?.transportError ? 1 : 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {console.error(error.message); process.exitCode = 1;});
}
