import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyNeedPair,
  marginalCoverageGain,
  semanticNeedOverlap,
  teamSpacingReport
} from "../src/index.mjs";

function need(id, coverage, overrides = {}) {
  return {
    id,
    status: "open",
    redundancyPolicy: "complementary",
    coverage,
    ...overrides
  };
}

test("P3a spacing: semantic overlap exposes dimensions separately", () => {
  const result = semanticNeedOverlap(
    need("a", {
      targetRefs: ["src/a", "src/shared"],
      hypothesisRefs: ["h1"],
      evidenceTypes: ["unit"],
      mutationScopes: ["src/shared"]
    }),
    need("b", {
      targetRefs: ["src/shared", "src/b"],
      hypothesisRefs: ["h2"],
      evidenceTypes: ["unit"],
      mutationScopes: ["src/shared"]
    })
  );

  assert.equal(result.overlaps, true);
  assert.deepEqual(result.dimensions.targetRefs, ["src/shared"]);
  assert.deepEqual(result.dimensions.hypothesisRefs, []);
  assert.deepEqual(result.dimensions.evidenceTypes, ["unit"]);
  assert.deepEqual(result.dimensions.mutationScopes, ["src/shared"]);
});

test("P3a spacing: mutation overlap is a contention risk, not automatic contention", () => {
  const result = classifyNeedPair(
    need("a", { mutationScopes: ["src/shared"] }),
    need("b", { mutationScopes: ["src/shared"] })
  );

  assert.equal(result.classification, "mutation_contention_risk");
  assert.equal(result.intentional, false);
});

test("P3a spacing: independent duplicate marks overlap as intentional verification", () => {
  const result = classifyNeedPair(
    need("a", {
      targetRefs: ["src/auth"],
      evidenceTypes: ["test"]
    }, { redundancyPolicy: "independent_duplicate" }),
    need("b", {
      targetRefs: ["src/auth"],
      evidenceTypes: ["test"]
    })
  );

  assert.equal(result.classification, "independent_verification");
  assert.equal(result.intentional, true);
});

test("P3a spacing: disjoint Needs stay disjoint", () => {
  const result = classifyNeedPair(
    need("a", { targetRefs: ["a"] }),
    need("b", { targetRefs: ["b"] })
  );

  assert.equal(result.classification, "disjoint");
  assert.equal(result.overlaps, false);
});

test("P3a spacing: team report separates accidental overlap from independent verification", () => {
  const report = teamSpacingReport([
    need("a", { targetRefs: ["auth"] }),
    need("b", { targetRefs: ["auth"] }),
    need("c", { targetRefs: ["payments"] }),
    need("d", { targetRefs: ["auth"] }, { redundancyPolicy: "independent_duplicate" })
  ]);

  assert.equal(report.activeNeedCount, 4);
  assert.equal(report.metrics.pairCount, 6);
  assert.equal(report.metrics.overlappingPairCount, 3);
  assert.equal(report.metrics.accidentalOverlapPairCount, 1);
  assert.equal(report.metrics.independentVerificationPairCount, 2);
});

test("P3a spacing: terminal Needs do not participate in current team spacing", () => {
  const report = teamSpacingReport([
    need("a", { targetRefs: ["auth"] }),
    need("b", { targetRefs: ["auth"] }, { status: "satisfied" })
  ]);

  assert.equal(report.activeNeedCount, 1);
  assert.equal(report.metrics.pairCount, 0);
});

test("P3a spacing: marginal coverage gain reports novel team coverage", () => {
  const existing = [
    need("a", {
      targetRefs: ["auth"],
      evidenceTypes: ["unit"]
    })
  ];

  const candidate = need("b", {
    targetRefs: ["auth", "payments"],
    evidenceTypes: ["integration"],
    hypothesisRefs: ["h-payment"]
  });

  const gain = marginalCoverageGain(candidate, existing);

  assert.deepEqual(gain.novel.targetRefs, ["payments"]);
  assert.deepEqual(gain.novel.evidenceTypes, ["integration"]);
  assert.deepEqual(gain.novel.hypothesisRefs, ["h-payment"]);
  assert.equal(gain.candidateCoverageItemCount, 4);
  assert.equal(gain.novelCoverageItemCount, 3);
  assert.equal(gain.marginalCoverageRatio, 0.75);
});

