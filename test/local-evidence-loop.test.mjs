import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { spawnSync } from "node:child_process";
import {
  planOntologyStressResponsibility
} from "../src/ontology-stress-baseline.mjs";
import {
  deriveEvidenceFeedback
} from "../src/evidence-feedback.mjs";

const ontology = JSON.parse(
  fs.readFileSync(
    new URL(
      "../benchmarks/courtshift/ontology-stress-baselines-v0.3.json",
      import.meta.url
    ),
    "utf8"
  )
);
const feedbackConfig = JSON.parse(
  fs.readFileSync(
    new URL(
      "../benchmarks/courtshift/local-evidence-feedback-v0.1.json",
      import.meta.url
    ),
    "utf8"
  )
);

function retryScenario(id, targetContractVersion, checks) {
  const feedback = deriveEvidenceFeedback({
    graderChecks: checks,
    feedbackConfig
  });

  return {
    scenarioId: id,
    targetContractVersion,
    stateRequirements: feedback.stateRequirements,
    stateObjective:
      "Resolve unsatisfied authoritative evidence.",
    stateRationale:
      "Frozen retry state derived from authoritative evidence."
  };
}

test("v2 feedback routes B3 and P to contract context", () => {
  const scenario = retryScenario(
    "retry-v2",
    2,
    [
      { name: "v2-source-priority", ok: false },
      { name: "v2-blocked-source", ok: false }
    ]
  );

  const b3 = planOntologyStressResponsibility({
    baselineId: "B3",
    scenario,
    evidenceRef: "evidence:test",
    config: ontology,
    now: "2026-01-01T00:00:00.000Z"
  });
  const p = planOntologyStressResponsibility({
    baselineId: "P",
    scenario,
    evidenceRef: "evidence:test",
    config: ontology,
    now: "2026-01-01T00:00:00.000Z"
  });

  assert.equal(b3.selectedWorkerId, "worker-contract");
  assert.equal(p.selectedWorkerId, "worker-contract");
});

test("artifact v3 evidence preserves B3/P ontology-stress divergence", () => {
  const scenario = retryScenario(
    "retry-artifact-v3",
    3,
    [
      {
        name: "v3-provenance-alias-and-priority",
        ok: false
      },
      {
        name: "v3-state-priority-precedes-option-priority",
        ok: false
      }
    ]
  );

  const b3 = planOntologyStressResponsibility({
    baselineId: "B3",
    scenario,
    evidenceRef: "evidence:test",
    config: ontology,
    now: "2026-01-01T00:00:00.000Z"
  });
  const p = planOntologyStressResponsibility({
    baselineId: "P",
    scenario,
    evidenceRef: "evidence:test",
    config: ontology,
    now: "2026-01-01T00:00:00.000Z"
  });

  assert.equal(
    b3.roleDecision.selectedScore.contextCoverage,
    0
  );
  assert.equal(b3.selectedWorkerId, "worker-contract");
  assert.equal(p.selectedWorkerId, "worker-forensics");
});

test("schema v3 evidence preserves B3/P ontology-stress divergence", () => {
  const scenario = retryScenario(
    "retry-schema-v3",
    3,
    [
      {
        name: "v3-current-partner-schema",
        ok: false
      },
      {
        name: "v3-inactive-status-excluded",
        ok: false
      }
    ]
  );

  const b3 = planOntologyStressResponsibility({
    baselineId: "B3",
    scenario,
    evidenceRef: "evidence:test",
    config: ontology,
    now: "2026-01-01T00:00:00.000Z"
  });
  const p = planOntologyStressResponsibility({
    baselineId: "P",
    scenario,
    evidenceRef: "evidence:test",
    config: ontology,
    now: "2026-01-01T00:00:00.000Z"
  });

  assert.equal(
    b3.roleDecision.selectedScore.contextCoverage,
    0
  );
  assert.equal(b3.selectedWorkerId, "worker-conflict");
  assert.equal(
    p.selectedWorkerId,
    "worker-external-state"
  );
});

test("evidence-loop cell script parses", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--check",
      new URL(
        "../scripts/run-local-evidence-loop-cell-v0.1.mjs",
        import.meta.url
      ).pathname
    ],
    {
      encoding: "utf8"
    }
  );

  assert.equal(
    result.status,
    0,
    result.stderr || result.stdout
  );
});
