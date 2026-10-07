import assert from "node:assert/strict";
import test from "node:test";
import {
  choosePredefinedRole,
  rankPredefinedRoles
} from "../src/index.mjs";

const roles = {
  implementer: {
    requiredCapabilities: ["implement"],
    contextRefs: ["implementation"]
  },
  contract_interpreter: {
    requiredCapabilities: ["implement", "analyze_contract"],
    contextRefs: ["contract"]
  },
  runtime_investigator: {
    requiredCapabilities: ["diagnose"],
    contextRefs: ["runtime_trace"]
  },
  verifier: {
    requiredCapabilities: ["verify"],
    contextRefs: ["evidence", "tests"]
  }
};

test("ontology role selector: known contract state selects contract role", () => {
  const decision = choosePredefinedRole({
    roles,
    stateRequirements: {
      capabilities: ["implement", "analyze_contract"],
      contextRefs: ["contract"]
    }
  });
  assert.equal(decision.selectedRoleId, "contract_interpreter");
});

test("ontology role selector: novel provenance state is not silently mapped by context", () => {
  const ranked = rankPredefinedRoles({
    roles,
    stateRequirements: {
      capabilities: ["diagnose", "verify"],
      contextRefs: ["provenance", "audit_log"]
    }
  });
  assert.equal(ranked[0].contextCoverage, 0);
  assert.equal(ranked.every((row) => row.contextCoverage === 0), true);
});

test("ontology role selector: ties resolve deterministically by role id", () => {
  const decision = choosePredefinedRole({
    roles: {
      zeta: { requiredCapabilities: ["diagnose"], contextRefs: [] },
      alpha: { requiredCapabilities: ["diagnose"], contextRefs: [] }
    },
    stateRequirements: {
      capabilities: ["diagnose"],
      contextRefs: ["novel"]
    }
  });
  assert.equal(decision.selectedRoleId, "alpha");
});
