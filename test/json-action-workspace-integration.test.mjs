import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { executeOllamaWorkspaceTool } from "../src/ollama-tool-loop.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
async function temp(t) {
  const parent = path.join(ROOT, "results/local");
  await fs.mkdir(parent, {recursive: true});
  const root = await fs.mkdtemp(path.join(parent, "path-contract-test-"));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  return root;
}
function child(args, env) {
  return new Promise((resolve, reject) => {
    const handle = spawn(process.execPath, [path.join(ROOT, "scripts/check-json-action-workspace-contract.mjs"), ...args], {
      cwd: ROOT, env: {...process.env, ...env}, stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = ""; let stderr = "";
    handle.stdout.on("data", (value) => {stdout += value;});
    handle.stderr.on("data", (value) => {stderr += value;});
    const timer = setTimeout(() => handle.kill("SIGKILL"), 60000);
    handle.once("error", (error) => {clearTimeout(timer); reject(error);});
    handle.once("close", (code, signal) => {clearTimeout(timer); resolve({code, signal, stdout, stderr});});
  });
}
async function server(t, selectAction) {
  const requests = [];
  const errors = [];
  const endpoint = http.createServer(async (req, res) => {
    try {
      let text = "";
      for await (const chunk of req) text += chunk;
      const body = JSON.parse(text); requests.push(body);
      const action = await selectAction(body, requests.length);
      res.writeHead(200, {"content-type": "application/json"});
      res.end(JSON.stringify({message: {content: JSON.stringify(action)}}));
    } catch (error) {
      errors.push(error);
      res.writeHead(500); res.end(error.message);
    }
  });
  await new Promise((resolve, reject) => {endpoint.once("error", reject); endpoint.listen(0, "127.0.0.1", resolve);});
  t.after(async () => {
    endpoint.closeAllConnections();
    await new Promise((resolve) => endpoint.close(resolve));
  });
  return {requests, errors, baseUrl: `http://127.0.0.1:${endpoint.address().port}`};
}
const sequence = [
  {action: "list_directory", path: "."},
  {action: "read_text_file", path: "TASK.md"},
  {action: "read_text_file", path: "contract/value.json"},
  {action: "read_text_file", path: "src/value.mjs", withLineNumbers: true},
  {action: "run_public_tests"},
  {action: "replace_line_range", path: "src/value.mjs", startLine: 1, endLine: 1, newText: "export const value = 2;"},
  {action: "run_public_tests"},
  {action: "finish", summary: "Fixture repaired; public tests pass."}
];

test("real CommandAgent envelope reaches JSON adapter without host paths and completes fixture", async (t) => {
  const root = await temp(t); const out = path.join(root, "attempt");
  const mock = await server(t, async (body, index) => {
    const allContent = body.messages.slice(0, 2).map((message) => message.content).join("\n");
    assert.equal(Object.hasOwn(body, "tools"), false);
    assert.equal(body.options.num_ctx, 32768);
    assert.equal(body.think, false);
    assert.ok(!allContent.includes(out));
    assert.ok(!allContent.includes("Before exiting, write a valid PLH"));
    assert.match(allContent, /RELATIVE to the assigned workspace/);
    assert.match(allContent, /path.*"\."/);
    if (index === 1) {
      const original = await fs.readFile(path.join(out, "fixture/execution/agent-instructions.md"), "utf8");
      assert.ok(original.includes(path.join(out, "fixture/execution/execution-result.json")));
      const prompt = await fs.readFile(path.join(out, "fixture/execution/json-action-agent-prompt.md"), "utf8");
      assert.ok(body.messages[1].content.startsWith(prompt.trimEnd()));
    }
    assert.ok(sequence[index - 1]);
    return sequence[index - 1];
  });
  const run = await child(["mock-local-model", out], {PLH_OLLAMA_BASE_URL: mock.baseUrl});
  assert.equal(run.code, 0, run.stderr || run.stdout);
  assert.deepEqual(mock.errors, []);
  const resultFile = path.join(out, "path-contract-preflight.json");
  const original = await fs.readFile(resultFile, "utf8");
  const result = JSON.parse(original);
  assert.equal(result.passed, true);
  assert.equal(result.pathRejectionCount, 0);
  assert.equal(result.actionCount, 8);
  assert.equal(result.successfulWriteActionCount, 1);
  assert.equal(result.hostTestExitCode, 0);
  const resultRecord = JSON.parse(await fs.readFile(path.join(out, "fixture/execution/execution-result.json"), "utf8"));
  assert.equal(resultRecord.status, "completed");
  assert.deepEqual(resultRecord.evidenceRefs, []);
  const again = await child(["mock-local-model", out], {PLH_OLLAMA_BASE_URL: mock.baseUrl});
  assert.notEqual(again.code, 0);
  assert.match(again.stderr, /EEXIST/);
  assert.equal(mock.requests.length, 8);
  assert.equal(await fs.readFile(resultFile, "utf8"), original);
});

test("twenty scripted absolute-path actions remain rejected with preserved evidence", async (t) => {
  const root = await temp(t); const out = path.join(root, "attempt");
  const mock = await server(t, (body, index) => index === 1
    ? {action: "read_text_file", path: path.join(out, "fixture/contract/value.json")}
    : {action: "list_directory", path: path.dirname(out)});
  const run = await child(["mock-local-model", out], {PLH_OLLAMA_BASE_URL: mock.baseUrl});
  assert.equal(run.code, 1, run.stderr || run.stdout);
  const result = JSON.parse(await fs.readFile(path.join(out, "path-contract-preflight.json"), "utf8"));
  assert.equal(mock.requests.length, 20);
  assert.equal(result.actionCount, 20);
  assert.equal(result.pathRejectionCount, 20);
  assert.equal(result.successfulWriteActionCount, 0);
  assert.equal(result.failure, "max_steps_exhausted");
  assert.equal(result.passed, false);
  assert.equal(result.gates.protectedUnchanged, true);
  assert.ok(result.actions.every((row) => row.ok === false && row.error === "absolute paths are not allowed"));
  assert.equal(await fs.readFile(path.join(out, "fixture/workspace/src/value.mjs"), "utf8"), "export const value = 1;\n");
});

test("absolute paths are rejected even inside workspace; parent traversal remains blocked", async (t) => {
  const root = await temp(t); const workspace = path.join(root, "workspace");
  await fs.mkdir(workspace);
  await fs.writeFile(path.join(workspace, "value.txt"), "inside");
  await fs.writeFile(path.join(root, "outside.txt"), "outside");
  for (const absolute of [path.join(workspace, "value.txt"), path.join(root, "outside.txt")]) {
    await assert.rejects(executeOllamaWorkspaceTool(workspace, {function: {name: "read_text_file", arguments: {path: absolute}}}), /absolute paths/);
  }
  await assert.rejects(executeOllamaWorkspaceTool(workspace, {function: {name: "read_text_file", arguments: {path: "../outside.txt"}}}), /escapes workspace/);
  const listing = await executeOllamaWorkspaceTool(workspace, {function: {name: "list_directory", arguments: {path: "."}}});
  assert.deepEqual(listing.entries.map((item) => item.name), ["value.txt"]);
});
