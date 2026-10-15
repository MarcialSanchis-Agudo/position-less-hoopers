import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  OLLAMA_JSON_ACTION_SCHEMA, runOllamaJsonActionAgent
} from "../src/ollama-json-action-loop.mjs";

const readAction = { action: "read_text_file", path: "src/value.mjs", withLineNumbers: true };
const editAction = {
  action: "replace_line_range", path: "src/value.mjs",
  startLine: 1, endLine: 1, newText: "export const value = 2;"
};
function reply(response, action) {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ message: { content: JSON.stringify(action) } }));
}
async function mockServer(t, handler) {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    try {
      let text = "";
      for await (const chunk of request) text += chunk;
      const body = JSON.parse(text);
      requests.push(body);
      await handler(response, body, requests.length);
    } catch (error) {
      response.writeHead(500);
      response.end(String(error));
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return { baseUrl: `http://127.0.0.1:${server.address().port}`, requests };
}
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "plh-json-failure-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const workspace = path.join(root, "workspace");
  await fs.mkdir(path.join(workspace, "src"), { recursive: true });
  await fs.writeFile(path.join(workspace, "src/value.mjs"), "export const value = 1;\n");
  return { root, workspace };
}
const options = (workspace, baseUrl) => ({
  model: "mock-local-model", workspace, baseUrl, prompt: "Repair the fixture.",
  requestTimeoutMs: 1000, totalTimeoutMs: 5000
});
function child(script, args = [], env = {}) {
  return new Promise((resolve, reject) => {
    const processHandle = spawn(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), ...args], {
      env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    processHandle.stdout.on("data", (chunk) => { stdout += chunk; });
    processHandle.stderr.on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => processHandle.kill("SIGKILL"), 15000);
    processHandle.once("error", (error) => { clearTimeout(timer); reject(error); });
    processHandle.once("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr });
    });
  });
}

test("JSON action success uses schema format, ordinary messages, and real edits", async (t) => {
  const { workspace } = await fixture(t);
  const sequence = [readAction, editAction, { action: "finish", summary: "done" }];
  const { baseUrl, requests } = await mockServer(t, (response, body, index) => {
    assert.equal(Object.hasOwn(body, "tools"), false);
    assert.deepEqual(body.format, OLLAMA_JSON_ACTION_SCHEMA);
    assert.equal(body.think, false);
    assert.equal(body.stream, false);
    assert.ok(body.messages.every((message) => ["user", "assistant", "system"].includes(message.role)));
    reply(response, sequence[index - 1]);
  });
  const result = await runOllamaJsonActionAgent(options(workspace, baseUrl));
  assert.equal(result.completed, true);
  assert.equal(result.actionCount, 3);
  assert.equal(result.writeActionCount, 1);
  assert.equal(result.requestCount, 3);
  assert.equal(requests.length, 3);
  assert.equal(result.transcript[3].actionResult.ok, true);
  assert.equal(await fs.readFile(path.join(workspace, "src/value.mjs"), "utf8"), "export const value = 2;\n");
});

test("HTTP failure before action one is recorded before sending and is not retried", async (t) => {
  const { workspace } = await fixture(t);
  const progress = [];
  const { baseUrl, requests } = await mockServer(t, (response) => {
    assert.equal(progress.at(-1).phase, "request_started");
    assert.equal(progress.at(-1).actionCount, 0);
    response.writeHead(500);
    response.end("XML syntax error: fixture");
  });
  const result = await runOllamaJsonActionAgent({
    ...options(workspace, baseUrl), onProgress: (value) => progress.push(structuredClone(value))
  });
  assert.equal(requests.length, 1);
  assert.equal(result.completed, false);
  assert.equal(result.failure, "structured_request_failed");
  assert.equal(result.actionCount, 0);
  assert.equal(result.lastRequest.index, 1);
  assert.equal(result.lastRequest.status, "failed");
  assert.match(result.agentError, /HTTP 500/);
  assert.equal(progress.at(-1).phase, "request_failed");
});

test("body consumption remains bounded after headers arrive", async (t) => {
  const { workspace } = await fixture(t);
  const { baseUrl, requests } = await mockServer(t, (response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.flushHeaders();
    const timer = setTimeout(() => {
      response.end(JSON.stringify({ message: { content: JSON.stringify({ action: "finish" }) } }));
    }, 500);
    t.after(() => clearTimeout(timer));
  });
  const result = await runOllamaJsonActionAgent({
    ...options(workspace, baseUrl), requestTimeoutMs: 100
  });
  assert.equal(result.completed, false);
  assert.equal(result.failure, "request_timeout");
  assert.equal(result.actionCount, 0);
  assert.equal(requests.length, 1);
  assert.match(result.agentError, /timeout after 100ms/);
});

test("failed later request retains actual read, edit, counters, and transcript", async (t) => {
  const { workspace } = await fixture(t);
  const { baseUrl, requests } = await mockServer(t, (response, body, index) => {
    if (index <= 2) return reply(response, [readAction, editAction][index - 1]);
    response.writeHead(500);
    response.end("fixture failure after editing");
  });
  const result = await runOllamaJsonActionAgent(options(workspace, baseUrl));
  assert.equal(result.completed, false);
  assert.equal(result.steps, 2);
  assert.equal(result.actionCount, 2);
  assert.equal(result.writeActionCount, 1);
  assert.equal(result.transcript.length, 4);
  assert.equal(result.transcript[3].actionResult.ok, true);
  assert.equal(result.requestCount, 3);
  assert.equal(result.lastRequest.step, 3);
  assert.equal(requests.length, 3);
});

for (const content of ["not JSON", JSON.stringify({ action: "unrecognized_action" })]) {
  test(`invalid protocol content fails without host actions: ${content}`, async (t) => {
    const { workspace } = await fixture(t);
    const { baseUrl, requests } = await mockServer(t, (response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ message: { content } }));
    });
    const result = await runOllamaJsonActionAgent(options(workspace, baseUrl));
    assert.equal(result.failure, "structured_request_failed");
    assert.equal(result.actionCount, 0);
    assert.equal(result.writeActionCount, 0);
    assert.equal(requests.length, 1);
  });
}

test("request uses the smaller remaining agent budget", async (t) => {
  const { workspace } = await fixture(t);
  const { baseUrl } = await mockServer(t, (response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.flushHeaders();
    const timer = setTimeout(() => response.end("{}"), 500);
    t.after(() => clearTimeout(timer));
  });
  const result = await runOllamaJsonActionAgent({
    ...options(workspace, baseUrl), requestTimeoutMs: 1000, totalTimeoutMs: 100
  });
  assert.equal(result.completed, false);
  assert.equal(result.failure, "agent_deadline_exhausted");
  assert.ok(result.lastRequest.timeoutMs <= 100);
});

test("max steps is terminal and retains its last action", async (t) => {
  const { workspace } = await fixture(t);
  const { baseUrl, requests } = await mockServer(t, (response) => reply(response, readAction));
  const result = await runOllamaJsonActionAgent({ ...options(workspace, baseUrl), maxSteps: 1 });
  assert.equal(result.failure, "max_steps_exhausted");
  assert.equal(result.steps, 1);
  assert.equal(result.transcript.length, 2);
  assert.equal(requests.length, 1);
});

test("preflight keeps incremental and final failure evidence after a real edit", async (t) => {
  const { root } = await fixture(t);
  const outDir = path.join(root, "preflight");
  const { baseUrl } = await mockServer(t, async (response, body, index) => {
    if (index <= 2) return reply(response, [readAction, editAction][index - 1]);
    const snapshot = JSON.parse(await fs.readFile(path.join(outDir, "provider-wrapper-telemetry.json"), "utf8"));
    assert.equal(snapshot.phase, "request_started");
    assert.equal(snapshot.actionCount, 2);
    response.writeHead(500);
    response.end("fixture post-edit failure");
  });
  const run = await child("../scripts/check-direct-ollama-json-action-edit.mjs", ["mock-local-model", outDir], {
    PLH_OLLAMA_BASE_URL: baseUrl
  });
  assert.equal(run.code, 1, run.stderr || run.stdout);
  const result = JSON.parse(await fs.readFile(path.join(outDir, "structured-json-action-preflight.json"), "utf8"));
  assert.equal(result.actionCount, 2);
  assert.equal(result.writeActionCount, 1);
  assert.equal(result.requestCount, 3);
  assert.equal(result.transcript.length, 4);
  assert.equal(result.hostTestExitCode, 0);
  assert.equal(result.agentCompleted, false);
  assert.equal(result.passed, false);
  assert.equal(result.failure, "structured_request_failed");
  const telemetry = JSON.parse(await fs.readFile(path.join(outDir, "provider-wrapper-telemetry.json"), "utf8"));
  assert.equal(telemetry.actionCount, 2);
  assert.equal(telemetry.lastRequest.status, "failed");
});

test("preflight completes read-edit-test-finish and refuses to erase that attempt", async (t) => {
  const { root } = await fixture(t);
  const outDir = path.join(root, "preflight");
  const sequence = [readAction, editAction, { action: "run_public_tests" }, { action: "finish", summary: "done" }];
  const { baseUrl, requests } = await mockServer(t, (response, body, index) => reply(response, sequence[index - 1]));
  const env = { PLH_OLLAMA_BASE_URL: baseUrl };
  const run = await child("../scripts/check-direct-ollama-json-action-edit.mjs", ["mock-local-model", outDir], env);
  assert.equal(run.code, 0, run.stderr || run.stdout);
  const file = path.join(outDir, "structured-json-action-preflight.json");
  const original = await fs.readFile(file, "utf8");
  const result = JSON.parse(original);
  assert.equal(result.passed, true);
  assert.equal(result.testActionCount, 1);
  assert.equal(result.hostTestExitCode, 0);
  const again = await child("../scripts/check-direct-ollama-json-action-edit.mjs", ["mock-local-model", outDir], env);
  assert.equal(again.code, 1);
  assert.match(again.stderr, /EEXIST/);
  assert.equal(requests.length, 4);
  assert.equal(await fs.readFile(file, "utf8"), original);
});

test("adapter keeps partial telemetry and emits failed result without external evidence", async (t) => {
  const { root, workspace } = await fixture(t);
  const runRoot = path.join(root, "execution");
  const requestPath = path.join(root, "request.json");
  const instructionsPath = path.join(root, "instructions.md");
  const resultPath = path.join(runRoot, "execution-result.json");
  await fs.writeFile(requestPath, JSON.stringify({ requestId: "mock-request" }));
  await fs.writeFile(instructionsPath, "Repair the fixture.");
  const { baseUrl } = await mockServer(t, (response, body, index) => {
    if (index <= 2) return reply(response, [readAction, editAction][index - 1]);
    response.writeHead(500);
    response.end("fixture adapter failure");
  });
  const run = await child("../examples/adapters/direct-ollama-json-action-agent.mjs", [], {
    PLH_EXECUTION_REQUEST: requestPath,
    PLH_EXECUTION_RESULT: resultPath,
    PLH_WORKSPACE: workspace,
    PLH_AGENT_INSTRUCTIONS: instructionsPath,
    PLH_RUN_ROOT: runRoot,
    PLH_LOCAL_MODEL: "mock-local-model",
    PLH_OLLAMA_BASE_URL: baseUrl
  });
  assert.equal(run.code, 1, run.stderr || run.stdout);
  const telemetry = JSON.parse(await fs.readFile(path.join(runRoot, "provider-wrapper-telemetry.json"), "utf8"));
  assert.equal(telemetry.agentCompleted, false);
  assert.equal(telemetry.agentSteps, 2);
  assert.equal(telemetry.actionCount, 2);
  assert.equal(telemetry.writeActionCount, 1);
  assert.equal(telemetry.requestCount, 3);
  assert.equal(telemetry.transcript.length, 4);
  assert.equal(telemetry.phase, "failed");
  assert.equal(telemetry.publicTestExitCode, null);
  assert.match(telemetry.agentError, /HTTP 500/);
  const result = JSON.parse(await fs.readFile(resultPath, "utf8"));
  assert.equal(result.status, "failed");
  assert.deepEqual(result.evidenceRefs, []);
});
