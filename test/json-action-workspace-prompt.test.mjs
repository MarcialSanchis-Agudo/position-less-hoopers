import assert from "node:assert/strict";
import test from "node:test";
import { buildJsonActionWorkspacePrompt } from "../src/json-action-workspace-contract.mjs";

const resultPath = "/private/host/cells/000/B0/execution/execution-result.json";
const task = "Read contract/value.json verbatim.\nRun npm test.\nDo not edit tests.";
const envelope = (instruction = task) => [
  "# PLH Execution Assignment", "", "Work only inside the provided workspace.", "",
  "## Objective", "Repair the fixture", "", "## Rationale", "A bounded path test", "",
  "## Task instruction", instruction, "", "## Authority",
  "Your allowed execution authority is encoded in execution-request.json.", "",
  "## Evidence obligations", "- fixture:verified", "", "## Completion protocol",
  `Before exiting, write a valid PLH ExecutionResult JSON object to: ${resultPath}`, "",
  "Allowed status values: completed, blocked, failed.",
  "Do not claim evidence that was not actually produced.", ""
].join("\n");

test("prompt removes only the host completion and authority directives", () => {
  const prompt = buildJsonActionWorkspacePrompt(envelope(), resultPath);
  assert.ok(!prompt.includes(resultPath));
  assert.ok(!prompt.includes("Before exiting, write a valid PLH"));
  assert.ok(!prompt.includes("authority is encoded in execution-request.json"));
  for (const unchanged of [task, "Repair the fixture", "A bounded path test", "- fixture:verified"]) {
    assert.ok(prompt.includes(unchanged));
  }
});

test("prompt supplies a relative root and recovery example without converting paths", () => {
  const prompt = buildJsonActionWorkspacePrompt(envelope(), resultPath);
  assert.match(prompt, /RELATIVE to the assigned workspace/);
  assert.ok(prompt.includes('{"action":"list_directory","path":"."}'));
  assert.match(prompt, /do not repeat it/);
  assert.match(prompt, /do not write a completion file/);
});

test("ordinary adapter instructions remain supported for isolated tests", () => {
  assert.ok(buildJsonActionWorkspacePrompt("Repair the fixture.", resultPath).includes("Repair the fixture."));
});

test("unexpected host completion envelope fails closed", () => {
  assert.throws(() => buildJsonActionWorkspacePrompt(envelope(), "/different/result.json"), /Unrecognized/);
  assert.throws(() => buildJsonActionWorkspacePrompt(envelope() + "changed footer", resultPath), /Unrecognized/);
});

test("missing authority envelope fails closed", () => {
  const bad = envelope().replace("Your allowed execution authority is encoded in execution-request.json.", "Changed");
  assert.throws(() => buildJsonActionWorkspacePrompt(bad, resultPath), /authority envelope/);
});

test("task text containing protocol headings is not stripped", () => {
  const nestedTask = task + "\n## Completion protocol\nThis is task content.\n## Authority\nTask authority text.";
  const prompt = buildJsonActionWorkspacePrompt(envelope(nestedTask), resultPath);
  assert.ok(prompt.includes(nestedTask));
});

test("invalid input fails before model execution", () => {
  for (const input of [null, "", 4]) assert.throws(() => buildJsonActionWorkspacePrompt(input, resultPath), TypeError);
  assert.throws(() => buildJsonActionWorkspacePrompt(task, null), TypeError);
});
