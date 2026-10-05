import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  createExecutionRequest,
  runCommandAgent
} from "../src/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

test("Claude adapter: file protocol works with a fresh fake CLI", async () => {
  const workspace = path.join(
    root,
    "results/test/claude-adapter-workspace"
  );
  const runRoot = path.join(
    root,
    "results/test/claude-adapter-run"
  );

  await fs.rm(workspace, { recursive: true, force: true });
  await fs.rm(runRoot, { recursive: true, force: true });
  await fs.mkdir(path.join(workspace, "src"), { recursive: true });
  await fs.mkdir(path.join(workspace, "test"), { recursive: true });

  await fs.writeFile(
    path.join(workspace, "package.json"),
    JSON.stringify({
      private: true,
      type: "module",
      scripts: { test: "node --test test/value.test.mjs" }
    }, null, 2) + "\n"
  );

  await fs.writeFile(
    path.join(workspace, "src/value.mjs"),
    "export const value = 1;\n"
  );

  await fs.writeFile(
    path.join(workspace, "test/value.test.mjs"),
    `import assert from "node:assert/strict";
import test from "node:test";
import { value } from "../src/value.mjs";
test("value is fixed", () => assert.equal(value, 2));
`
  );

  const request = createExecutionRequest({
    region: {
      id: "region-claude-test",
      goalId: "goal-claude-test",
      stateVersion: "v1"
    },
    need: {
      id: "need-claude-test",
      objective: "Fix value to satisfy tests",
      rationale: "Adapter protocol test",
      requirements: {},
      coverage: {},
      evidenceObligations: [],
      exitConditions: []
    },
    responsibility: {
      id: "responsibility-claude-test",
      needId: "need-claude-test",
      assigneeId: "claude-code",
      assignmentVersion: 1,
      authority: {
        investigate: true,
        propose: true,
        execute: true,
        requestHelp: false,
        mutateScopes: ["workspace"]
      },
      evidenceObligations: [],
      expiresAt: "2026-10-01T00:00:00.000Z"
    },
    workspace,
    taskInstruction: "Fix src/value.mjs and run npm test."
  });

  const adapter = {
    schemaVersion: 1,
    adapterId: "claude-code",
    command: process.execPath,
    args: [
      path.join(root, "examples/adapters/claude-code-agent.mjs")
    ],
    timeoutMs: 30000,
    env: {
      CLAUDE_BIN: process.execPath,
      CLAUDE_PREFIX_ARGS_JSON: JSON.stringify([
        path.join(root, "fixtures/agents/fake-claude.mjs")
      ]),
      PLH_CLAUDE_MODEL: "fake-model",
      PLH_CLAUDE_EFFORT: "medium"
    }
  };

  const run = await runCommandAgent(request, adapter, { runRoot });

  assert.equal(run.result.status, "completed");
  assert.equal(run.telemetry.exitCode, 0);

  const moduleText = await fs.readFile(
    path.join(workspace, "src/value.mjs"),
    "utf8"
  );
  assert.match(moduleText, /value = 2/);

  const telemetry = JSON.parse(
    await fs.readFile(
      path.join(runRoot, "claude-wrapper-telemetry.json"),
      "utf8"
    )
  );

  assert.equal(telemetry.cliVersion, "fake-claude 0.0.1");
  assert.equal(telemetry.requestedModel, "fake-model");
  assert.equal(telemetry.requestedEffort, "medium");
  assert.equal(telemetry.freshSession, true);
  assert.equal(telemetry.publicTestExitCode, 0);
});

