import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  createExecutionRequest,
  npmTestResultParser,
  runLocalExecutionRequest
} from "../src/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

function requestFor(workspace) {
  return createExecutionRequest({
    region: {
      id: "region-local",
      goalId: "goal-local",
      stateVersion: "v1"
    },
    need: {
      id: "need-local",
      objective: "Run workspace tests",
      rationale: "Validate local runner",
      requirements: {},
      coverage: {},
      evidenceObligations: ["evidence:tests-pass"],
      exitConditions: ["evidence:tests-pass"]
    },
    responsibility: {
      id: "responsibility-local",
      needId: "need-local",
      assigneeId: "local-runner",
      assignmentVersion: 1,
      authority: {
        investigate: false,
        propose: false,
        execute: true,
        requestHelp: false,
        mutateScopes: []
      },
      evidenceObligations: ["evidence:tests-pass"],
      expiresAt: "2026-09-29T12:00:00.000Z"
    },
    workspace,
    taskInstruction: "Run npm test."
  });
}

test("LocalRunner: successful command yields evidence-bearing completed result", async () => {
  const workspace = path.join(root, "results/test/local-runner-pass");
  await fs.rm(workspace, { recursive: true, force: true });
  await fs.mkdir(workspace, { recursive: true });
  await fs.writeFile(
    path.join(workspace, "package.json"),
    JSON.stringify({
      type: "module",
      scripts: { test: "node --test" }
    })
  );
  await fs.mkdir(path.join(workspace, "test"), { recursive: true });
  await fs.writeFile(
    path.join(workspace, "test/pass.test.mjs"),
    `import test from "node:test"; import assert from "node:assert/strict"; test("pass",()=>assert.equal(1,1));\n`
  );

  const request = requestFor(workspace);
  const run = runLocalExecutionRequest(request, {
    command: process.execPath,
    args: ["--test", "test/pass.test.mjs"],
    cwd: workspace,
    resultParser: npmTestResultParser
  });

  assert.equal(run.result.status, "completed");
  assert.deepEqual(run.result.evidenceRefs, ["evidence:tests-pass"]);
  assert.equal(run.telemetry.exitCode, 0);
  assert.ok(run.telemetry.durationMs >= 0);
});

test("LocalRunner: failed command does not fabricate evidence", async () => {
  const workspace = path.join(root, "results/test/local-runner-fail");
  await fs.rm(workspace, { recursive: true, force: true });
  await fs.mkdir(workspace, { recursive: true });
  const request = requestFor(workspace);
  const run = runLocalExecutionRequest(request, {
    command: process.execPath,
    args: ["-e", "process.exit(3)"],
    cwd: workspace,
    resultParser: npmTestResultParser
  });

  assert.equal(run.result.status, "failed");
  assert.deepEqual(run.result.evidenceRefs, []);
  assert.notEqual(run.telemetry.exitCode, 0);
});

