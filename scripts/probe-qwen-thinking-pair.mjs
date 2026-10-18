// Local Qwen diagnostics only. No solver loop, action execution, or grader imports.
import fs from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
import {isDeepStrictEqual} from "node:util";
import {fileURLToPath} from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REQUEST_TIMEOUT_MS = 120000;
export const CAPTURE_LIMIT = 2097152;
export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const requireThat = (ok, message) => {if (!ok) throw new Error(message);};
export const ACTION_SCHEMA = {
  type: "object", required: ["action"], properties: {
    action: {type: "string", enum: ["read_text_file", "list_directory", "write_text_file",
      "replace_line_range", "replace_text_in_file", "run_public_tests", "finish"]},
    path: {type: ["string", "null"]}, withLineNumbers: {type: ["boolean", "null"]},
    content: {type: ["string", "null"]}, startLine: {type: ["integer", "null"]},
    endLine: {type: ["integer", "null"]}, newText: {type: ["string", "null"]},
    oldText: {type: ["string", "null"]}, replaceAll: {type: ["boolean", "null"]},
    summary: {type: ["string", "null"]}
  }
};
export function buildPair(requestText, prior) {
  requireThat(prior?.mode === "single_request_diagnostic" && prior.requestCount === 1 &&
    prior.emittedActionsExecuted === 0 && prior.gradersRun === 0 &&
    prior.originalSourceCommit === "f2601deb6222c7fde1eb64d254a50a6001efe375" &&
    prior.originalRequestIndex === 12, "Expected the saved B1 request-12 diagnostic");
  requireThat(sha256(requestText) === prior.requestSha256, "Saved request hash mismatch");
  requireThat(typeof prior.ollamaVersion === "string" && prior.ollamaVersion.length > 0 &&
    /^[a-f0-9]{64}$/.test(prior.modelDigestNow ?? ""), "Prior server version/model digest missing");
  const request = JSON.parse(requestText);
  requireThat(isDeepStrictEqual(Object.keys(request).sort(),
    ["model", "messages", "stream", "think", "format", "options"].sort()) &&
    request.model === "qwen3.5:9b" && request.stream === false && request.think === false &&
    isDeepStrictEqual(request.options, {num_ctx: 32768, temperature: 0}) &&
    isDeepStrictEqual(request.format, ACTION_SCHEMA) && Array.isArray(request.messages) &&
    request.messages.length > 0 && request.messages.every((m) =>
      ["system", "user", "assistant"].includes(m.role) && typeof m.content === "string" &&
      isDeepStrictEqual(Object.keys(m).sort(), ["content", "role"])),
    "Saved request differs from the frozen JSON-only request shape");
  const on = {...request, think: true};
  const {think: ignoredOff, ...restOff} = request;
  const {think: ignoredOn, ...restOn} = on;
  requireThat(isDeepStrictEqual(restOff, restOn), "Only think may differ");
  return [
    {id: "think-false", think: false, body: requestText},
    {id: "think-true", think: true, body: JSON.stringify(on)}
  ];
}
export function localOrigin(value) {
  const url = new URL(value);
  requireThat(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
    !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash,
    "Only a loopback HTTP origin is allowed");
  return url.origin;
}
export async function capture(url, {body = null, timeoutMs = REQUEST_TIMEOUT_MS, maxBytes = CAPTURE_LIMIT} = {}) {
  const controller = new AbortController(); const start = Date.now(); const chunks = [];
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let bytes = 0; let complete = false; let error = null; let status = null;
  try {
    const response = await fetch(url, {method: body === null ? "GET" : "POST", redirect: "error",
      ...(body === null ? {} : {body, headers: {"content-type": "application/json"}}), signal: controller.signal});
    status = response.status;
    for await (const value of response.body) {
      const available = maxBytes - bytes;
      chunks.push(Buffer.from(value).subarray(0, available)); bytes += Math.min(value.length, available);
      if (value.length > available) {controller.abort(); throw new Error("capture_limit_exceeded");}
    }
    complete = true;
  } catch (e) {error = e.message === "capture_limit_exceeded" ? e.message :
    controller.signal.aborted ? "request_timeout" : String(e.message ?? e);}
  finally {clearTimeout(timer);}
  return {status, complete, error, durationMs: Date.now() - start, raw: Buffer.concat(chunks)};
}
// Complete validation of THIS frozen schema, not a general JSON Schema implementation.
export function schemaErrors(action) {
  if (!action || typeof action !== "object" || Array.isArray(action)) return ["expected object"];
  const errors = ACTION_SCHEMA.required.filter((key) => !Object.hasOwn(action, key)).map((key) => `missing ${key}`);
  for (const [key, rule] of Object.entries(ACTION_SCHEMA.properties)) {
    if (!Object.hasOwn(action, key)) continue;
    const value = action[key]; const types = Array.isArray(rule.type) ? rule.type : [rule.type];
    if (!types.some((type) => type === "null" ? value === null :
      type === "integer" ? Number.isInteger(value) : typeof value === type)) errors.push(`${key}: wrong type`);
    if (rule.enum && !rule.enum.includes(value)) errors.push(`${key}: not in enum`);
  }
  // The frozen schema allows extra properties and does not require edit arguments.
  return errors;
}
export function inspect(captured) {
  const report = {httpStatus: captured.status, responseComplete: captured.complete,
    transportError: captured.error, durationMs: captured.durationMs, responseBytes: captured.raw.length,
    envelopeValidJson: false, messageValidJson: false, actionSchemaValid: null,
    selectedAction: null, parseError: null, parseErrorContext: null, done: null, doneReason: null};
  let content = null;
  try {
    const envelope = JSON.parse(captured.raw.toString("utf8")); report.envelopeValidJson = true;
    Object.assign(report, {done: envelope?.done ?? null, doneReason: envelope?.done_reason ?? null,
      responseModel: envelope?.model ?? null, promptEvalCount: envelope?.prompt_eval_count ?? null,
      evalCount: envelope?.eval_count ?? null, thinkingChars: envelope?.message?.thinking?.length ?? 0});
    content = envelope?.message?.content;
    if (typeof content !== "string") {content = null; throw new Error("Missing string message.content");}
    report.contentChars = content.length;
    const action = JSON.parse(content); report.messageValidJson = true;
    report.actionSchemaErrors = schemaErrors(action); report.actionSchemaValid = report.actionSchemaErrors.length === 0;
    report.selectedAction = typeof action?.action === "string" ? action.action : null;
  } catch (e) {
    report.parseError = String(e.message);
    const match = report.parseError.match(/position (\d+)/);
    if (content !== null && match) {
      const offset = Number(match[1]);
      report.parseErrorContext = {offsetUtf16: offset, before: content.slice(Math.max(0, offset - 70), offset),
        after: content.slice(offset, offset + 70)};
    }
  }
  return {report, content};
}
const inside = (root, target) => {const rel = path.relative(root, target);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));};
async function readFile(file) {
  const info = await fs.lstat(file);
  requireThat(info.isFile() && !info.isSymbolicLink() && info.size <= CAPTURE_LIMIT, "Expected bounded regular input file");
  return fs.readFile(file, "utf8");
}
export async function reserve(root, outArg, sources) {
  const output = path.resolve(root, outArg);
  requireThat(output !== root && inside(root, output) && sources.every((source) => !inside(source, output)),
    "Output must be new, inside repository, and outside all existing evidence directories");
  let parent = root;
  for (const segment of path.relative(root, output).split(path.sep).slice(0, -1)) {
    parent = path.join(parent, segment);
    try {const info = await fs.lstat(parent); requireThat(info.isDirectory() && !info.isSymbolicLink(), "Symlink output parent rejected");}
    catch (e) {if (e.code !== "ENOENT") throw e; await fs.mkdir(parent);}
  }
  await fs.mkdir(output); return output;
}
async function writeJson(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value, null, 2) + "\n", {flag: "wx"});
  await fs.rename(temporary, file);
}
async function metadata(base, model) {
  const [version, tags] = await Promise.all([capture(`${base}/api/version`, {timeoutMs: 10000}),
    capture(`${base}/api/tags`, {timeoutMs: 10000})]);
  requireThat([version, tags].every((r) => r.status === 200 && r.complete && r.error === null), "Metadata request failed");
  const models = JSON.parse(tags.raw.toString("utf8")).models;
  const entry = models?.find((m) => m.name === model || m.model === model);
  return {observedAt: new Date().toISOString(), ollamaVersion: JSON.parse(version.raw.toString("utf8")).version,
    modelDigest: entry?.digest ?? null};
}
export function outcome(records, environmentStable) {
  if (!environmentStable || records.length !== 2 || !records.every((r) =>
    r.response?.httpStatus === 200 && r.response.responseComplete && r.response.transportError === null &&
    r.response.envelopeValidJson && r.response.done === true && r.response.doneReason === "stop" &&
    r.response.responseModel === "qwen3.5:9b")) return "inconclusive";
  const a = records[0].response.actionSchemaValid === true;
  const b = records[1].response.actionSchemaValid === true;
  return !a && b ? "only_think_true_schema_valid" : a && b ? "both_schema_valid" :
    !a && !b ? "neither_schema_valid" : "only_think_false_schema_valid";
}
export async function runPair(rootArg, probeArg, outArg, {send = false, baseUrl = "http://127.0.0.1:11434"} = {}) {
  const root = await fs.realpath(rootArg); const probe = await fs.realpath(path.resolve(root, probeArg));
  requireThat(inside(root, probe) && probe !== root, "Source probe must be inside repository");
  const priorText = await readFile(path.join(probe, "probe-summary.json")); const prior = JSON.parse(priorText);
  const requestText = await readFile(path.join(probe, "request.json")); const pair = buildPair(requestText, prior);
  const originalRun = await fs.realpath(prior.sourceRun);
  requireThat(inside(root, originalRun) && originalRun !== root, "Original run must remain inside repository");
  const base = localOrigin(baseUrl); const output = await reserve(root, outArg, [probe, originalRun]);
  const summary = {schemaVersion: 1, developmentOnly: true, publicationClaimEligible: false,
    mode: send ? "paired_thinking_diagnostic" : "offline_prepare_only", changedRequestFields: ["think"],
    sourceProbe: probe, sourceRequestSha256: sha256(requestText), sourceSummarySha256: sha256(priorText),
    expectedVersion: prior.ollamaVersion, expectedModelDigest: prior.modelDigestNow,
    sameModelDigestAsOriginalBatch: null, requestTimeoutMs: REQUEST_TIMEOUT_MS, captureLimitBytes: CAPTURE_LIMIT,
    requestCount: 0, emittedActionsExecuted: 0, gradersRun: 0, runtimeValidationPassed: null,
    environmentStable: send ? true : null, environmentChecks: [], records: [], error: null, outputDir: output};
  for (const item of pair) {
    await fs.mkdir(path.join(output, item.id));
    await fs.writeFile(path.join(output, item.id, "request.json"), item.body, {flag: "wx"});
    summary.records.push({id: item.id, think: item.think, requestSha256: sha256(item.body), status: "not_sent"});
  }
  const summaryFile = path.join(output, "thinking-pair-summary.json"); await writeJson(summaryFile, summary);
  async function checkEnvironment() {
    const observed = await metadata(base, "qwen3.5:9b"); summary.environmentChecks.push(observed);
    const matches = observed.ollamaVersion === prior.ollamaVersion && observed.modelDigest === prior.modelDigestNow;
    if (!matches) summary.environmentStable = false;
    await writeJson(summaryFile, summary);
    requireThat(matches, "Server version/model digest differs from saved probe; no automatic update or retry");
  }
  if (send) {
    try {
      await checkEnvironment();
      for (let i = 0; i < pair.length; i += 1) {
        const item = pair[i]; const record = summary.records[i];
        record.status = "in_flight"; record.startedAt = new Date().toISOString(); summary.requestCount += 1;
        await writeJson(summaryFile, summary);
        const captured = await capture(`${base}/api/chat`, {body: item.body});
        await fs.writeFile(path.join(output, item.id, "response-body.raw"), captured.raw, {flag: "wx"});
        const {report, content} = inspect(captured);
        if (content !== null) await fs.writeFile(path.join(output, item.id, "message-content.txt"), content, {flag: "wx"});
        record.status = "captured"; record.responseSha256 = sha256(captured.raw); record.response = report;
        await writeJson(summaryFile, summary);
        requireThat(captured.status === 200 && captured.complete && captured.error === null,
          "Transport/HTTP failure; stopping rather than issuing another inference");
        await checkEnvironment();
      }
    } catch (e) {summary.error = String(e.message); summary.environmentStable = false;}
  }
  summary.observedPattern = outcome(summary.records, summary.environmentStable);
  summary.pairedCaptureComplete = send && summary.error === null && summary.observedPattern !== "inconclusive";
  summary.interpretation = "One fixed-order pair is diagnostic only. Valid schema output is not proof of constraint enforcement, safe arguments, task correctness, or runtime reliability.";
  await writeJson(summaryFile, summary); return summary;
}
async function main() {
  const [probe, output, flag] = process.argv.slice(2);
  requireThat(probe && output && process.argv.length <= 5 && (flag === undefined || flag === "--send-pair"),
    "usage: node scripts/probe-qwen-thinking-pair.mjs <existing-probe-directory> <new-output-directory> [--send-pair]");
  const summary = await runPair(ROOT, probe, output, {send: flag === "--send-pair",
    baseUrl: process.env.PLH_OLLAMA_BASE_URL || "http://127.0.0.1:11434"});
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = flag === "--send-pair" && !summary.pairedCaptureComplete ? 1 : 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {console.error(e.message); process.exitCode = 1;});
}
