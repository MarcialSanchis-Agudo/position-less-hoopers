import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  planOntologyStressResponsibility
} from "../src/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const ontology = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      "benchmarks/courtshift/ontology-stress-baselines-v0.3.json"
    ),
    "utf8"
  )
);

function readScenario(relativePath) {
  return JSON.parse(
    fs.readFileSync(path.join(root, relativePath), "utf8")
  );
}

function plan(baselineId, scenario) {
  return planOntologyStressResponsibility({
    baselineId,
    scenario,
    evidenceRef:
      `evidence:test-v${scenario.targetContractVersion}`,
    config: ontology,
    now: "2026-10-07T08:00:00.000Z"
  });
}

test(
  "v0.3 mechanism: covered contract change remains inside frozen ontology",
  () => {
    const scenario = readScenario(
      "examples/artifact-lineage-incident/scenarios/covered-contract-change.json"
    );

    const b3 = plan("B3", scenario);
    const p = plan("P", scenario);

    assert.equal(
      b3.selectedRoleId,
      "contract_interpreter"
    );
    assert.equal(
      b3.roleDecision.selectedScore.contextCoverage,
      1
    );
    assert.equal(
      b3.selectedWorkerId,
      "worker-contract"
    );
    assert.equal(
      p.selectedWorkerId,
      "worker-contract"
    );
  }
);

test(
  "v0.3 mechanism: provenance stress exposes ontology gap and P routes to forensics",
  () => {
    const scenario = readScenario(
      "examples/artifact-lineage-incident/scenarios/provenance-stress.json"
    );

    const b3 = plan("B3", scenario);
    const p = plan("P", scenario);

    assert.equal(
      b3.roleDecision.selectedScore.contextCoverage,
      0
    );
    assert.equal(
      b3.selectedRoleId,
      "contract_interpreter"
    );
    assert.equal(
      b3.selectedWorkerId,
      "worker-contract"
    );
    assert.equal(
      p.selectedWorkerId,
      "worker-forensics"
    );
  }
);

test(
  "v0.3 mechanism: schema-history stress exposes ontology gap and P routes to external-state worker",
  () => {
    const scenario = readScenario(
      "examples/schema-bridge-incident/scenarios/schema-history-stress.json"
    );

    const b3 = plan("B3", scenario);
    const p = plan("P", scenario);

    assert.equal(
      b3.roleDecision.selectedScore.contextCoverage,
      0
    );
    assert.equal(
      b3.selectedRoleId,
      "conflict_resolver"
    );
    assert.equal(
      b3.selectedWorkerId,
      "worker-conflict"
    );
    assert.equal(
      p.selectedWorkerId,
      "worker-external-state"
    );
  }
);

test(
  "v0.3 reference smoke: all 30 cells execute before real-agent outcomes",
  () => {
    const out =
      `results/test/ontology-stress-matrix-${process.pid}`;
    const script = path.join(
      root,
      "scripts/run-ontology-stress-matrix.mjs"
    );

    const result = spawnSync(
      process.execPath,
      [
        script,
        "benchmarks/courtshift/ontology-stress-eval-v0.3.json",
        "benchmarks/courtshift/ontology-stress-baselines-v0.3.json",
        out,
        "examples/adapters/reference-agent.json",
        "1"
      ],
      {
        cwd: root,
        encoding: "utf8",
        timeout: 120000
      }
    );

    assert.equal(
      result.status,
      0,
      result.stdout + result.stderr
    );

    const summary = JSON.parse(
      fs.readFileSync(
        path.join(
          root,
          out,
          "ontology-stress-matrix-summary.json"
        ),
        "utf8"
      )
    );

    assert.equal(summary.runCount, 30);
    assert.equal(summary.analyzableRunCount, 30);
    assert.equal(summary.failedCellCount, 0);

    for (const baseline of summary.byBaseline) {
      assert.equal(baseline.runCount, 6);
      assert.equal(baseline.successCount, 6);
    }

    assert.equal(
      summary.mechanismComparison.stressPairCount,
      2
    );
    assert.equal(
      summary.mechanismComparison.workerDivergenceCount,
      2
    );
    assert.equal(
      summary.mechanismComparison
        .zeroB3RoleContextCoverageCount,
      2
    );
  }
);
