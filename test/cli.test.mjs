import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const cli = path.join(root, "bin", "plh-field.mjs");

function runFixture(name) {
  const fixture = path.join(root, "fixtures", "p0", name);
  const result = spawnSync(process.execPath, [cli, fixture, "--metrics"], {
    cwd: root,
    encoding: "utf8"
  });
  return result;
}

test("CLI: clean fixture emits field and metrics JSON", () => {
  const result = runFixture("clean.json");
  assert.equal(result.status, 0, result.stderr);

  const output = JSON.parse(result.stdout);
  assert.equal(output.field.goalId, "goal-p0-clean");
  assert.equal(output.metrics.coveredWorkCount, 2);
  assert.equal(output.metrics.uncoveredWorkCount, 0);
  assert.equal(output.metrics.coverageRatio, 1);
});

test("CLI: worker-loss fixture exposes one uncovered work unit", () => {
  const result = runFixture("perturbed-worker-loss.json");
  assert.equal(result.status, 0, result.stderr);

  const output = JSON.parse(result.stdout);
  assert.equal(output.metrics.coveredWorkCount, 1);
  assert.equal(output.metrics.uncoveredWorkCount, 1);
  assert.equal(output.metrics.coverageRatio, 0.5);
  assert.equal(output.metrics.knownCostUsd, 0.46);
});

test("CLI: malformed JSON exits non-zero", () => {
  const result = spawnSync(process.execPath, [cli, "-"], {
    cwd: root,
    encoding: "utf8",
    input: "{bad-json"
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unexpected|JSON/);
});

