import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  classifyPublicationScenario,
  planPublicationResponsibility
} from "../src/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const baselineConfig = JSON.parse(
  fs.readFileSync(
    path.join(root, "benchmarks/courtshift/publication-baselines-v0.1.json"),
    "utf8"
  )
);

const clean = {
  schemaVersion: 1,
  scenarioId: "clean",
  kind: "clean",
  initialContractVersion: 2,
  targetContractVersion: 2,
  perturbation: null
};
const contractChange = {
  schemaVersion: 1,
  scenarioId: "contract",
  kind: "perturbed",
  initialContractVersion: 1,
  targetContractVersion: 2,
  perturbation: {
    type: "contract_reveal",
    contractVersion: 2
  }
};
const regression = {
  schemaVersion: 1,
  scenarioId: "regression",
  kind: "perturbed",
  initialContractVersion: 2,
  targetContractVersion: 2,
  perturbation: {
    type: "workspace_regression",
    source: "seed/src/x.mjs",
    destination: "src/x.mjs"
  }
};

function planned(baselineId, scenario) {
  const classification = classifyPublicationScenario(scenario);
  return planPublicationResponsibility({
    baselineId,
    phaseKind: classification.phaseKind,
    taskPackId: "test-pack",
    scenarioId: scenario.scenarioId,
    contractVersion: scenario.targetContractVersion,
    evidenceRef: "evidence:test-v2",
    config: baselineConfig,
    now: "2026-10-06T08:00:00.000Z"
  });
}

test("publication baselines: frozen coordination laws select expected workers", () => {
  assert.equal(planned("B0", clean).selectedWorkerId, "generalist");
  assert.equal(planned("B1", contractChange).selectedWorkerId, "worker-implementation");

  assert.equal(planned("B2", clean).selectedWorkerId, "worker-implementation");
  assert.equal(planned("B2", contractChange).selectedWorkerId, "worker-contract");
  assert.equal(planned("B2", regression).selectedWorkerId, "worker-implementation");

  assert.equal(planned("B3", clean).selectedWorkerId, "worker-implementation");
  assert.equal(planned("B3", contractChange).selectedWorkerId, "worker-contract");
  assert.equal(planned("B3", regression).selectedWorkerId, "worker-implementation");

  assert.equal(planned("P", clean).selectedWorkerId, "worker-implementation");
  assert.equal(planned("P", contractChange).selectedWorkerId, "worker-contract");
  assert.equal(planned("P", regression).selectedWorkerId, "worker-implementation");

  assert.equal(planned("B3", contractChange).ontologyType, "dynamic_predefined_roles");
  assert.equal(planned("P", contractChange).ontologyType, "state_derived_need");
});

test("publication matrix: one reference replicate runs all prospective task/scenario/baseline cells", () => {
  const out = `results/test/publication-matrix-${process.pid}`;
  const script = path.join(root, "scripts/run-publication-baseline-matrix.mjs");
  const result = spawnSync(
    process.execPath,
    [
      script,
      "benchmarks/courtshift/publication-eval-set-v0.2.json",
      "benchmarks/courtshift/publication-baselines-v0.1.json",
      out,
      "examples/adapters/reference-agent.json",
      "1"
    ],
    { cwd: root, encoding: "utf8", timeout: 120000 }
  );

  assert.equal(result.status, 0, result.stdout + result.stderr);

  const summary = JSON.parse(
    fs.readFileSync(
      path.join(root, out, "publication-baseline-matrix-summary.json"),
      "utf8"
    )
  );

  assert.equal(summary.taskCount, 2);
  assert.equal(summary.repeats, 1);
  assert.equal(summary.runCount, 40);
  assert.equal(summary.analyzableRunCount, 40);
  assert.equal(summary.failedCellCount, 0);

  for (const baseline of summary.byBaseline) {
    assert.equal(baseline.runCount, 8);
    assert.equal(baseline.successCount, 8);
    assert.equal(baseline.clean.runCount, 2);
    assert.equal(baseline.clean.successCount, 2);
    assert.equal(baseline.perturbed.runCount, 6);
    assert.equal(baseline.perturbed.successCount, 6);
  }

  const contractRows = summary.records.filter(
    (row) => row.scenarioClass === "contract_reveal"
  );
  assert.equal(
    contractRows.find((row) => row.baselineId === "B1").selectedWorkerId,
    "worker-implementation"
  );
  assert.equal(
    contractRows.find((row) => row.baselineId === "B3").selectedWorkerId,
    "worker-contract"
  );
  assert.equal(
    contractRows.find((row) => row.baselineId === "P").selectedWorkerId,
    "worker-contract"
  );

  const regressionRows = summary.records.filter(
    (row) => row.scenarioClass === "workspace_regression"
  );
  assert.equal(
    regressionRows.find((row) => row.baselineId === "P").selectedWorkerId,
    "worker-implementation"
  );
});
