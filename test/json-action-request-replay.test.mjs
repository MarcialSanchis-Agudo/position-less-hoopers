import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {captureOnce, frozenRequestTemplate, reconstructRequest, inspectResponse, localBase,
  reserveOutput, gitBlobSha, LOOP_SHA} from "../scripts/probe-json-action-failed-request.mjs";

const source = await fs.readFile(new URL("../src/ollama-json-action-loop.mjs", import.meta.url), "utf8");
const config = {executorFamily: {defaultModel: "qwen3.5:9b", client: "Direct Ollama structured JSON action loop",
  pathContractVersion: "workspace-relative-v0.1.2", settings: {maxSteps: 20, numCtx: 32768}}};
function telemetry() {
  return {failure: "structured_request_failed", agentCompleted: false, requestedModel: "qwen3.5:9b",
    cli: config.executorFamily.client, pathContractVersion: config.executorFamily.pathContractVersion,
    agentError: "Ollama structured-action response was not valid JSON: {bad",
    actionCount: 1, requestCount: 2, lastRequest: {index: 2, step: 2, status: "failed", timeoutMs: 120000},
    transcript: [{step: 1, action: {action: "read_text_file", path: "test"}},
      {step: 1, actionResult: {ok: false, error: "path is not a file"}}]};
}
async function temp(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "plh-replay-"));
  t.after(() => fs.rm(dir, {recursive: true, force: true}));
  return dir;
}
async function server(t, handler) {
  const requests = [];
  const endpoint = http.createServer(async (req, res) => {
    try {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      requests.push(raw);
      await handler(res, raw, requests.length);
    } catch (error) {res.writeHead(500); res.end(error.message);}
  });
  await new Promise((resolve, reject) => {endpoint.once("error", reject); endpoint.listen(0, "127.0.0.1", resolve);});
  t.after(async () => {endpoint.closeAllConnections(); await new Promise((resolve) => endpoint.close(resolve));});
  return {requests, url: `http://127.0.0.1:${endpoint.address().port}`};
}
const schema = frozenRequestTemplate(source, "fixture").format;

test("source extraction is pinned and handles quotes, dollars and multiline prompt exactly", () => {
  assert.equal(gitBlobSha(source), LOOP_SHA);
  const prompt = 'hello "$&"\nsecond line\\path';
  const value = frozenRequestTemplate(source, prompt);
  assert.equal(value.messages[1].content.startsWith(prompt + "\n\nAvailable actions:"), true);
  assert.equal(value.format.properties.action.enum.length, 7);
  assert.throws(() => frozenRequestTemplate(source + "\n", prompt), /bytes do not match/);
});

test("reconstruction retains failed host results but never adds a failed response or retry instruction", () => {
  const body = reconstructRequest(source, "fixture", telemetry(), config);
  assert.equal(body.messages.length, 4);
  assert.equal(body.messages[3].content, 'RESULT for read_text_file:\n{"ok":false,"error":"path is not a file"}\n\nChoose the next JSON action.');
  assert.equal(Object.hasOwn(body, "tools"), false);
  assert.deepEqual(body.options, {num_ctx: 32768, temperature: 0});
  assert.equal(body.think, false); assert.equal(body.stream, false);
  assert.equal(JSON.stringify(body).includes("{bad"), false);
});

test("wrong models, incomplete traces, successful runs and repeated accounting fail closed", () => {
  for (const mutate of [x => {x.requestedModel = "other";}, x => {x.transcript.pop();},
    x => {x.agentCompleted = true;}, x => {x.requestCount = 3;},
    x => {x.transcript[1].step = 9;}, x => {x.transcript[0].action.action = "finish";}]) {
    const value = telemetry(); mutate(value);
    assert.throws(() => reconstructRequest(source, "fixture", value, config));
  }
});

test("only loopback HTTP origins are accepted", () => {
  assert.equal(localBase("http://127.0.0.1:11434/"), "http://127.0.0.1:11434");
  for (const url of ["https://example.com", "http://example.com", "http://user@localhost", "http://localhost/path", "http://localhost/?x=1"]) {
    assert.throws(() => localBase(url));
  }
});

test("output reservation preserves existing evidence and rejects source descendants and symlinks", async (t) => {
  const root = await temp(t); const run = path.join(root, "run"); await fs.mkdir(run);
  const output = await reserveOutput(root, "diagnostics/one", run);
  await fs.writeFile(path.join(output, "sentinel"), "original");
  await assert.rejects(reserveOutput(root, "diagnostics/one", run), {code: "EEXIST"});
  await assert.rejects(reserveOutput(root, "run/inside", run), /existing run/);
  await assert.rejects(reserveOutput(root, "../outside", run), /inside this repository/);
  await fs.symlink(run, path.join(root, "linked"), "dir");
  await assert.rejects(reserveOutput(root, "linked/inside", run), /Symlink/);
  assert.equal(await fs.readFile(path.join(output, "sentinel"), "utf8"), "original");
});

test("full malformed multiline response is retained beyond the old 1000 character preview", async (t) => {
  const content = '{"action":"replace_text_in_file","path":"src/x.mjs","oldText":"x",newText":"' + "q".repeat(3000) + '"}';
  const raw = JSON.stringify({model: "qwen3.5:9b", done: true, done_reason: "stop", eval_count: 800,
    message: {content}});
  const mock = await server(t, (res) => {res.writeHead(200); res.end(raw);});
  const capture = await captureOnce(mock.url + "/api/chat", {body: "{}"});
  const inspected = inspectResponse(capture, schema);
  assert.equal(mock.requests.length, 1); assert.equal(capture.raw.toString(), raw);
  assert.equal(inspected.content, content);
  assert.equal(inspected.report.messageValidJson, false);
  assert.equal(inspected.report.envelopeValidJson, true);
  assert.equal(inspected.report.doneReason, "stop");
  assert.equal(inspected.report.actionExecuted, false);
});

test("valid emitted file-writing action is inspected only and cannot mutate a workspace", async (t) => {
  const root = await temp(t); const file = path.join(root, "unchanged"); await fs.writeFile(file, "before");
  const raw = JSON.stringify({done: true, done_reason: "stop", message: {content: JSON.stringify({
    action: "write_text_file", path: file, content: "after"})}});
  const mock = await server(t, (res) => {res.writeHead(200); res.end(raw);});
  const capture = await captureOnce(mock.url + "/api/chat", {body: "{}"});
  const {report} = inspectResponse(capture, schema);
  assert.equal(report.messageValidJson, true); assert.equal(report.actionNameAllowed, true);
  assert.equal(report.actionExecuted, false); assert.equal(report.fullActionSchemaValidated, false);
  assert.equal(await fs.readFile(file, "utf8"), "before"); assert.equal(mock.requests.length, 1);
});

test("HTTP failure and malformed response envelope stay distinct with no retry", async (t) => {
  const mock = await server(t, (res) => {res.writeHead(500); res.end("not an envelope");});
  const capture = await captureOnce(mock.url + "/api/chat", {body: "{}"});
  const {report} = inspectResponse(capture, schema);
  assert.equal(report.httpStatus, 500); assert.equal(report.envelopeValidJson, false);
  assert.equal(capture.raw.toString(), "not an envelope"); assert.equal(mock.requests.length, 1);
});

test("response body timeout retains bytes already received and does not retry", async (t) => {
  const mock = await server(t, (res) => {res.writeHead(200); res.flushHeaders(); res.write('{"partial":');});
  const capture = await captureOnce(mock.url + "/api/chat", {body: "{}", timeoutMs: 300});
  assert.equal(capture.complete, false); assert.equal(capture.error, "request_timeout");
  assert.equal(capture.raw.toString(), '{"partial":'); assert.equal(mock.requests.length, 1);
});

test("capture size limit is explicit, not mistaken for generation truncation", async (t) => {
  const mock = await server(t, (res) => {res.writeHead(200); res.end("x".repeat(64));});
  const capture = await captureOnce(mock.url + "/api/chat", {body: "{}", maxBytes: 32});
  assert.equal(capture.error, "response_capture_limit_exceeded"); assert.equal(capture.raw.length, 32);
  assert.equal(capture.complete, false); assert.equal(mock.requests.length, 1);
});

test("production loop: reconstructed request bytes equal actual failed-request bytes", async (t) => {
  const {runOllamaJsonActionAgent} = await import("../src/ollama-json-action-loop.mjs");
  const root = await temp(t); const prompt = 'literal "$&"\nsecond line\\path';
  const mock = await server(t, (res, raw, index) => {
    const action = index === 1 ? {action: "read_text_file", path: "missing.txt"} : {action: "list_directory", path: "."};
    res.writeHead(200); res.end(JSON.stringify({message: {content: index <= 2 ? JSON.stringify(action) : "{bad"}}));
  });
  const result = await runOllamaJsonActionAgent({workspace: root, model: "qwen3.5:9b", prompt, baseUrl: mock.url});
  assert.equal(result.failure, "structured_request_failed"); assert.equal(result.actionCount, 2);
  // Persisted adapter telemetry renames the raw loop's completed field.
  const saved = {...result, agentCompleted: result.completed, requestedModel: "qwen3.5:9b", cli: config.executorFamily.client,
    pathContractVersion: config.executorFamily.pathContractVersion};
  const reconstructed = reconstructRequest(source, prompt, saved, config);
  assert.equal(JSON.stringify(reconstructed), mock.requests[2]);
  assert.equal(mock.requests.length, 3);
});

test("production CLI: one diagnostic inference, no action execution and no old evidence overwritten", async (t) => {
  const {spawn} = await import("node:child_process");
  const {fileURLToPath} = await import("node:url");
  const root = fileURLToPath(new URL("../", import.meta.url));
  const parent = path.join(root, "results/local"); await fs.mkdir(parent, {recursive: true});
  const area = await fs.mkdtemp(path.join(parent, "request-probe-test-"));
  t.after(() => fs.rm(area, {recursive: true, force: true}));
  const run = path.join(area, "original"); const output = path.join(area, "diagnostic");
  const b0 = path.join(run, "cells/000/artifact-lineage-incident/artifact-lineage-clean-v2/B0");
  const b1 = path.join(run, "cells/001/artifact-lineage-incident/artifact-lineage-clean-v2/B1/execution");
  await fs.mkdir(path.join(b0, "execution"), {recursive: true}); await fs.mkdir(b1, {recursive: true});
  const mock = await server(t, (res, raw) => {
    res.writeHead(200);
    res.end(raw ? JSON.stringify({done: true, done_reason: "stop", message: {content: '{"action": invalid'}})
      : JSON.stringify({version: "mock-version", models: [{name: "qwen3.5:9b", digest: "mock-digest"}]}));
  });
  const actualConfig = JSON.parse(await fs.readFile(path.join(root,
    "benchmarks/courtshift/local-json-action-runtime-validation-eval-v0.1.2-qwen35-9b.json"), "utf8"));
  const env = {PLH_LOCAL_MODEL: "qwen3.5:9b", PLH_OLLAMA_BASE_URL: mock.url,
    PLH_OLLAMA_JSON_MAX_STEPS: "20", PLH_OLLAMA_NUM_CTX: "32768",
    PLH_OLLAMA_JSON_REQUEST_TIMEOUT_MS: "120000", PLH_OLLAMA_JSON_TOTAL_TIMEOUT_MS: "480000"};
  const originalFiles = new Map([
    [path.join(run, "json-action-validation-provenance.json"), JSON.stringify({
      sourceCommit: "f2601deb6222c7fde1eb64d254a50a6001efe375", evaluationSetId: actualConfig.evaluationSetId,
      runtimeBlobs: actualConfig.executorFamily.runtimeBlobs, pinnedEnvironment: env})],
    [path.join(run, "ontology-stress-checkpoint.json"), JSON.stringify({nextCellIndex: 1, infrastructureFailures: [{baselineId: "B1"}]})],
    [path.join(b1, "provider-wrapper-telemetry.json"), JSON.stringify({...telemetry(), baseUrl: mock.url})],
    [path.join(b1, "json-action-agent-prompt.md"), "Saved fixture prompt\n"],
    [path.join(b0, "ontology-stress-cell-result.json"), JSON.stringify({status: "failed", final: {correct: false, evidenceSatisfied: false}})],
    [path.join(b0, "execution/provider-wrapper-telemetry.json"), JSON.stringify({finalContent: "fixture", transcript: []})]
  ]);
  for (const [file, content] of originalFiles) await fs.writeFile(file, content);
  const child = () => new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [path.join(root, "scripts/probe-json-action-failed-request.mjs"), run, output, "--send-once"],
      {cwd: root, stdio: ["ignore", "pipe", "pipe"]});
    let stdout = ""; let stderr = "";
    proc.stdout.on("data", x => {stdout += x;}); proc.stderr.on("data", x => {stderr += x;});
    const timer = setTimeout(() => proc.kill("SIGKILL"), 20000);
    proc.on("error", error => {clearTimeout(timer); reject(error);});
    proc.on("close", code => {clearTimeout(timer); resolve({code, stdout, stderr});});
  });
  const first = await child(); assert.equal(first.code, 0, first.stderr || first.stdout);
  const summary = JSON.parse(await fs.readFile(path.join(output, "probe-summary.json"), "utf8"));
  assert.equal(summary.requestCount, 1); assert.equal(summary.emittedActionsExecuted, 0);
  assert.equal(summary.response.messageValidJson, false); assert.equal(summary.originalResponseRecovered, false);
  assert.equal(summary.modelDigestNow, "mock-digest"); assert.equal(summary.ollamaVersion, "mock-version");
  assert.equal(mock.requests.filter(x => x.length > 0).length, 1);
  assert.equal(await fs.readFile(path.join(output, "message-content.txt"), "utf8"), '{"action": invalid');
  assert.equal((await child()).code, 1); // Existing output is never reused.
  assert.equal(mock.requests.filter(x => x.length > 0).length, 1);
  for (const [file, content] of originalFiles) assert.equal(await fs.readFile(file, "utf8"), content);
});
