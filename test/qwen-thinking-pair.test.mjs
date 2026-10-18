import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import test from "node:test";
import {ACTION_SCHEMA, buildPair, capture, inspect, localOrigin, outcome, reserve, runPair, schemaErrors,
  sha256} from "../scripts/probe-qwen-thinking-pair.mjs";
const REQUEST = {model: "qwen3.5:9b", messages: [{role: "user", content: 'Keep this literal: "$&"\nline two'}],
  stream: false, think: false, format: ACTION_SCHEMA, options: {num_ctx: 32768, temperature: 0}};
function priorFor(text) {
  return {mode: "single_request_diagnostic", requestCount: 1, emittedActionsExecuted: 0, gradersRun: 0,
    originalSourceCommit: "f2601deb6222c7fde1eb64d254a50a6001efe375", originalRequestIndex: 12,
    requestSha256: sha256(text), ollamaVersion: "0.30.11", modelDigestNow: "a".repeat(64)};
}
async function temp(t, base = os.tmpdir()) {
  const root = await fs.mkdtemp(path.join(base, "qwen-thinking-test-"));
  t.after(() => fs.rm(root, {recursive: true, force: true})); return root;
}
async function fixture(root) {
  const original = path.join(root, "original"); const probe = path.join(root, "probe");
  await fs.mkdir(original); await fs.mkdir(probe);
  const text = JSON.stringify(REQUEST); const prior = {...priorFor(text), sourceRun: original};
  await fs.writeFile(path.join(original, "evidence.txt"), "retain original evidence");
  await fs.writeFile(path.join(probe, "request.json"), text);
  await fs.writeFile(path.join(probe, "probe-summary.json"), JSON.stringify(prior));
  return {original, probe, text, prior};
}
async function server(t, handle) {
  const chats = []; let tagCalls = 0;
  const endpoint = http.createServer(async (req, res) => {
    try {
      let raw = ""; for await (const chunk of req) raw += chunk;
      res.setHeader("content-type", "application/json");
      if (req.url === "/api/version") {res.end(JSON.stringify({version: "0.30.11"})); return;}
      if (req.url === "/api/tags") {
        tagCalls += 1;
        const digest = handle.digest?.(tagCalls) ?? "a".repeat(64);
        res.end(JSON.stringify({models: [{name: REQUEST.model, digest}]})); return;
      }
      assert.equal(req.url, "/api/chat"); assert.equal(req.method, "POST");
      const body = JSON.parse(raw); chats.push({body, raw});
      await handle.chat(res, body, chats.length);
    } catch (e) {res.statusCode = 500; res.end(JSON.stringify({error: e.message}));}
  });
  await new Promise((resolve) => endpoint.listen(0, "127.0.0.1", resolve));
  t.after(async () => {endpoint.closeAllConnections(); await new Promise((resolve) => endpoint.close(resolve));});
  return {chats, url: `http://127.0.0.1:${endpoint.address().port}`};
}
function envelope(content) {
  return {model: REQUEST.model, message: {content}, done: true, done_reason: "stop", eval_count: 12};
}
function captured(content) {
  return {status: 200, complete: true, error: null, durationMs: 1, raw: Buffer.from(JSON.stringify(envelope(content)))};
}

test("pair preserves the complete control bytes and differs only in think", () => {
  const text = JSON.stringify(REQUEST, null, 2) + "\n";
  const pair = buildPair(text, priorFor(text));
  assert.equal(pair[0].body, text); assert.equal(JSON.parse(pair[1].body).think, true);
  const compare = JSON.parse(pair[1].body); compare.think = false;
  assert.deepEqual(compare, REQUEST);
});

test("wrong hashes, native tool fields, schema changes and metadata gaps fail before inference", () => {
  const text = JSON.stringify(REQUEST);
  assert.throws(() => buildPair(text, {...priorFor(text), requestSha256: "wrong"}), /hash mismatch/);
  for (const bad of [{...REQUEST, tools: []}, {...REQUEST, think: true}, {...REQUEST, format: "json"},
    {...REQUEST, options: {...REQUEST.options, num_predict: 50}}, {...REQUEST, model: "other"}]) {
    const raw = JSON.stringify(bad); assert.throws(() => buildPair(raw, priorFor(raw)), /request shape/);
  }
  assert.throws(() => buildPair(text, {...priorFor(text), modelDigestNow: null}), /digest missing/);
});

test("malformed content is distinguished from transport, envelope, and schema errors", () => {
  const bad = inspect(captured('{"action":"read_text_file",path:"TASK.md"}'));
  assert.equal(bad.report.envelopeValidJson, true); assert.equal(bad.report.messageValidJson, false);
  assert.equal(bad.report.actionSchemaValid, null); assert.ok(bad.report.parseErrorContext);
  const typed = inspect(captured('{"action":"replace_line_range","startLine":"one"}'));
  assert.equal(typed.report.messageValidJson, true); assert.equal(typed.report.actionSchemaValid, false);
  const outer = inspect({...captured("{}"), raw: Buffer.from("{bad")});
  assert.equal(outer.report.envelopeValidJson, false);
});

test("frozen schema validation is explicit about optional arguments and extra properties", () => {
  assert.deepEqual(schemaErrors({action: "finish", anything: 42}), []);
  assert.deepEqual(schemaErrors({action: "replace_line_range"}), []); // Original schema does not require bounds.
  assert.ok(schemaErrors({action: "unknown"}).length);
  assert.ok(schemaErrors(null).length); assert.ok(schemaErrors([]).length);
});

test("loopback origin rejects remote endpoints, credentials, paths and alternate protocols", () => {
  assert.equal(localOrigin("http://127.0.0.1:11434"), "http://127.0.0.1:11434");
  for (const url of ["http://example.org", "https://localhost", "http://u:p@localhost", "http://localhost/api/chat"])
    assert.throws(() => localOrigin(url), /loopback/);
});

test("reservations preserve existing evidence and reject nested or symlink output", async (t) => {
  const root = await temp(t); const {original, probe} = await fixture(root);
  for (const out of ["original/new", "probe/new", "../outside"]) {
    await assert.rejects(reserve(root, out, [original, probe]), /outside all existing evidence/);
  }
  await reserve(root, "new", [original, probe]);
  await assert.rejects(reserve(root, "new", [original, probe]), {code: "EEXIST"});
  await fs.symlink(original, path.join(root, "link"));
  await assert.rejects(reserve(root, "link/new", [original, probe]), /Symlink/);
});

test("offline preparation makes no requests and preserves original input bytes", async (t) => {
  const root = await temp(t); const {text} = await fixture(root);
  const result = await runPair(root, "probe", "offline", {baseUrl: "http://127.0.0.1:1"});
  assert.equal(result.requestCount, 0); assert.equal(result.environmentStable, null);
  assert.equal(await fs.readFile(path.join(root, "offline/think-false/request.json"), "utf8"), text);
  assert.equal(await fs.readFile(path.join(root, "probe/request.json"), "utf8"), text);
});

test("paired diagnostic captures two responses and never executes a returned write", async (t) => {
  const root = await temp(t); const {text} = await fixture(root);
  const mock = await server(t, {chat(res, body) {
    const content = body.think ? JSON.stringify({action: "write_text_file", path: "DO_NOT_CREATE.txt", content: "never execute"})
      : '{"action":"replace_text_in_file",newText:"bad"}';
    res.end(JSON.stringify(envelope(content)));
  }});
  const result = await runPair(root, "probe", "pair", {send: true, baseUrl: mock.url});
  assert.equal(mock.chats.length, 2); assert.equal(mock.chats[0].raw, text);
  assert.deepEqual(mock.chats[1].body, {...REQUEST, think: true});
  assert.equal(result.observedPattern, "only_think_true_schema_valid");
  assert.equal(result.pairedCaptureComplete, true); assert.equal(result.emittedActionsExecuted, 0);
  assert.equal(result.gradersRun, 0); assert.equal(result.runtimeValidationPassed, null);
  assert.equal(result.environmentChecks.length, 3);
  assert.equal(await fs.readFile(path.join(root, "original/evidence.txt"), "utf8"), "retain original evidence");
  await assert.rejects(fs.stat(path.join(root, "DO_NOT_CREATE.txt")), {code: "ENOENT"});
  assert.equal(await fs.readFile(path.join(root, "pair/think-false/message-content.txt"), "utf8"),
    '{"action":"replace_text_in_file",newText:"bad"}');
  await assert.rejects(runPair(root, "probe", "pair", {send: true, baseUrl: mock.url}), {code: "EEXIST"});
  assert.equal(mock.chats.length, 2);
});

test("changed model metadata before the pair prevents all inference", async (t) => {
  const root = await temp(t); await fixture(root);
  const mock = await server(t, {digest: () => "b".repeat(64), chat() {assert.fail("must not infer");}});
  const result = await runPair(root, "probe", "pair", {send: true, baseUrl: mock.url});
  assert.equal(result.requestCount, 0); assert.equal(mock.chats.length, 0);
  assert.equal(result.environmentStable, false); assert.match(result.error, /differs/);
});

test("model drift between conditions stops after the first inference", async (t) => {
  const root = await temp(t); await fixture(root);
  const mock = await server(t, {digest: (n) => (n === 1 ? "a" : "b").repeat(64),
    chat: (res) => res.end(JSON.stringify(envelope('{"action":"finish"}')))});
  const result = await runPair(root, "probe", "pair", {send: true, baseUrl: mock.url});
  assert.equal(mock.chats.length, 1); assert.equal(result.records[1].status, "not_sent");
  assert.equal(result.observedPattern, "inconclusive");
});

test("HTTP error retains raw response and does not submit the other condition", async (t) => {
  const root = await temp(t); await fixture(root);
  const mock = await server(t, {chat(res) {res.statusCode = 500; res.end("model unavailable");}});
  const result = await runPair(root, "probe", "pair", {send: true, baseUrl: mock.url});
  assert.equal(mock.chats.length, 1); assert.equal(result.pairedCaptureComplete, false);
  assert.equal(await fs.readFile(path.join(root, "pair/think-false/response-body.raw"), "utf8"), "model unavailable");
});

test("partial body timeout and capture limit remain distinct from malformed generation", async (t) => {
  const mock = await server(t, {chat(res, body) {
    if (body.stall) {res.write("partial"); return;}
    res.end("a".repeat(100));
  }});
  const timed = await capture(`${mock.url}/api/chat`, {body: '{"stall":true}', timeoutMs: 250});
  assert.equal(timed.error, "request_timeout"); assert.equal(timed.complete, false);
  assert.equal(timed.raw.toString(), "partial");
  const limited = await capture(`${mock.url}/api/chat`, {body: "{}", maxBytes: 10});
  assert.equal(limited.error, "capture_limit_exceeded"); assert.equal(limited.raw.length, 10);
});

test("outcome is descriptive only; a timeout or length stop is inconclusive", () => {
  const row = (valid) => ({response: {...inspect(captured('{"action":"finish"}')).report, actionSchemaValid: valid}});
  assert.equal(outcome([row(true), row(true)], true), "both_schema_valid");
  assert.equal(outcome([row(false), row(false)], true), "neither_schema_valid");
  assert.equal(outcome([row(true), row(false)], true), "only_think_false_schema_valid");
  const rows = [row(false), row(true)]; rows[1].response.doneReason = "length";
  assert.equal(outcome(rows, true), "inconclusive");
});

test("CLI defaults to offline and persists a complete zero-request report", async (t) => {
  const repo = fileURLToPath(new URL("../", import.meta.url));
  const directory = await temp(t, repo); const {probe} = await fixture(directory);
  const output = path.join(directory, "cli-offline");
  const child = spawn(process.execPath, [path.join(repo, "scripts/probe-qwen-thinking-pair.mjs"), probe, output],
    {stdio: ["ignore", "pipe", "pipe"]});
  let stdout = ""; let stderr = "";
  child.stdout.on("data", (x) => stdout += x); child.stderr.on("data", (x) => stderr += x);
  const code = await new Promise((resolve, reject) => {child.once("error", reject); child.once("close", resolve);});
  assert.equal(code, 0, stderr); assert.equal(JSON.parse(stdout).requestCount, 0);
  assert.equal(JSON.parse(await fs.readFile(path.join(output, "thinking-pair-summary.json"), "utf8")).mode, "offline_prepare_only");
});
