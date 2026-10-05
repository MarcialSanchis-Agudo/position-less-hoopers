import assert from "node:assert/strict";
import fsSync from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const prepare = path.join(root, "scripts/prepare-task-pack.mjs");
const runCell = path.join(root, "scripts/run-experiment-cell.mjs");

function run(command, args) {
  return spawnSync(process.execPath, [command, ...args], {
    cwd: root,
    encoding: "utf8"
  });
}

function prepareSingle(manifest, out, policy = "plh_direct") {
  const result = run(prepare, [manifest, out, policy]);
  assert.equal(result.status, 0, result.stderr);
}

test("ExperimentCell: reference adapter solves checkout clean-v2 with external evidence", () => {
  const out = `results/test/cell-checkout-${process.pid}`;
  prepareSingle("examples/checkout-incident/task-pack.json", out);

  const runRoot = path.join(
    root,
    out,
    "checkout-clean-v2",
    "plh_direct"
  );

  const result = run(runCell, [
    path.relative(root, runRoot),
    "examples/adapters/reference-agent.json"
  ]);

  assert.equal(result.status, 0, result.stdout + result.stderr);

  const cell = JSON.parse(
    fsSync.readFileSync(path.join(runRoot, "cell-result.json"), "utf8")
  );

  assert.equal(cell.externalCorrect, true);
  assert.equal(cell.evidenceSatisfied, true);
  assert.deepEqual(
    cell.authoritativeEvidenceRefs,
    ["evidence:checkout-contract-v2"]
  );
  assert.equal(fsSync.existsSync(
    path.join(runRoot, "execution-request.json")
  ), true);
  assert.equal(fsSync.existsSync(
    path.join(runRoot, "agent-telemetry.json")
  ), true);
  assert.equal(fsSync.existsSync(
    path.join(runRoot, "grade.json")
  ), true);
});

test("ExperimentCell: same reference adapter solves config migration TaskPack", () => {
  const out = `results/test/cell-config-${process.pid}`;
  prepareSingle("examples/config-migration-incident/task-pack.json", out);

  const runRoot = path.join(
    root,
    out,
    "config-clean-v2",
    "plh_direct"
  );

  const result = run(runCell, [
    path.relative(root, runRoot),
    "examples/adapters/reference-agent.json"
  ]);

  assert.equal(result.status, 0, result.stdout + result.stderr);

  const cell = JSON.parse(
    fsSync.readFileSync(path.join(runRoot, "cell-result.json"), "utf8")
  );

  assert.equal(cell.externalCorrect, true);
  assert.equal(cell.evidenceSatisfied, true);
  assert.deepEqual(
    cell.authoritativeEvidenceRefs,
    ["evidence:config-migration-v2"]
  );
});

test("ExperimentCell: agent-declared evidence is not authoritative without grader success", () => {
  const out = `results/test/cell-cheater-${process.pid}`;
  prepareSingle("examples/checkout-incident/task-pack.json", out);

  const runRoot = path.join(
    root,
    out,
    "checkout-clean-v2",
    "plh_direct"
  );

  const result = run(runCell, [
    path.relative(root, runRoot),
    "examples/adapters/claim-only-agent.json"
  ]);

  assert.notEqual(result.status, 0);

  const cell = JSON.parse(
    fsSync.readFileSync(path.join(runRoot, "cell-result.json"), "utf8")
  );

  assert.equal(cell.executionStatus, "completed");
  assert.deepEqual(
    cell.agentReportedEvidenceRefs,
    ["evidence:checkout-contract-v2"]
  );
  assert.equal(cell.externalCorrect, false);
  assert.deepEqual(cell.authoritativeEvidenceRefs, []);
  assert.equal(cell.evidenceSatisfied, false);
});

