import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_P3B_WEIGHTS,
  admitNeedProposal,
  allocateNextResponsibility,
  chooseNeedForTeam,
  needFeasibility,
  rankNeedsForTeam,
  scoreNeedForTeam
} from "../src/index.mjs";

let serial = 0;

function makeNeed(id, overrides = {}) {
  serial += 1;
  const coverage = overrides.coverage ?? {};
  const requirements = overrides.requirements ?? {};
  return admitNeedProposal({
    goalId: "g-team",
    objective: overrides.objective ?? `Need ${id}`,
    rationale: overrides.rationale ?? "Team allocation test",
    stateVersion: overrides.stateVersion ?? `v-${serial}`,
    requirements: {
      capabilities: requirements.capabilities ?? ["implement"],
      toolAccess: requirements.toolAccess ?? [],
      permissions: requirements.permissions ?? [],
      contextRefs: requirements.contextRefs ?? []
    },
    coverage: {
      targetRefs: coverage.targetRefs ?? [],
      hypothesisRefs: coverage.hypothesisRefs ?? [],
      evidenceTypes: coverage.evidenceTypes ?? [],
      mutationScopes: coverage.mutationScopes ?? []
    },
    urgency: overrides.urgency ?? 0.5,
    importance: overrides.importance ?? 0.5,
    uncertainty: overrides.uncertainty ?? 0,
    risk: overrides.risk ?? 0,
    expectedInformationGain: overrides.expectedInformationGain ?? 0,
    redundancyPolicy: overrides.redundancyPolicy ?? "complementary",
    dependencies: overrides.dependencies ?? [],
    evidenceObligations: overrides.evidenceObligations ?? [],
    exitConditions: overrides.exitConditions ?? [],
    createdBy: "deterministic_signal"
  }, [], {
    id,
    now: "2026-09-28T14:00:00.000Z"
  }).need;
}

function activeResponsibility(needId, overrides = {}) {
  return {
    id: overrides.id ?? `r-${needId}`,
    needId,
    assigneeId: overrides.assigneeId ?? "agent-existing",
    assignmentVersion: overrides.assignmentVersion ?? 1,
    status: overrides.status ?? "active"
  };
}

test("P3b allocator: default development weights are explicit and stable", () => {
  assert.deepEqual(DEFAULT_P3B_WEIGHTS, {
    urgency: 0.25,
    importance: 0.25,
    informationGain: 0.15,
    uncertainty: 0.05,
    marginalCoverage: 0.30,
    independentVerification: 0.15,
    accidentalOverlap: 0.20,
    mutationRisk: 0.35
  });
});

test("P3b allocator: novel coverage can beat a more urgent mutation-overlapping Need", () => {
  const teamNeed = makeNeed("team", {
    coverage: {
      targetRefs: ["auth"],
      mutationScopes: ["auth"]
    }
  });

  const urgentOverlap = makeNeed("urgent-overlap", {
    urgency: 0.9,
    importance: 0.9,
    coverage: {
      targetRefs: ["auth"],
      mutationScopes: ["auth"]
    }
  });

  const novel = makeNeed("novel", {
    urgency: 0.6,
    importance: 0.6,
    coverage: {
      targetRefs: ["payments"],
      mutationScopes: ["payments"]
    }
  });

  const decision = chooseNeedForTeam([urgentOverlap, novel], {
    teamNeeds: [teamNeed]
  });

  assert.equal(decision.selectedNeedId, "novel");
  const overlapScore = decision.ranked.find((row) => row.needId === "urgent-overlap").score;
  assert.equal(overlapScore.components.mutationRisk, 1);
  assert.equal(overlapScore.components.marginalCoverage, 0);
});

test("P3b allocator: independent verification can receive positive overlap value", () => {
  const teamNeed = makeNeed("team", {
    coverage: {
      targetRefs: ["auth"],
      evidenceTypes: ["integration"]
    }
  });

  const verify = makeNeed("verify", {
    urgency: 0.9,
    importance: 0.9,
    expectedInformationGain: 0.9,
    uncertainty: 0.5,
    redundancyPolicy: "independent_duplicate",
    coverage: {
      targetRefs: ["auth"],
      evidenceTypes: ["integration"]
    }
  });

  const score = scoreNeedForTeam(verify, {
    teamNeeds: [teamNeed]
  });

  assert.ok(score.components.independentVerification > 0);
  assert.equal(score.components.accidentalOverlap, 0);
  assert.equal(score.components.mutationRisk, 0);
});

test("P3b allocator: unsatisfied dependencies are a hard constraint", () => {
  const blocked = makeNeed("blocked", {
    urgency: 1,
    importance: 1,
    dependencies: ["need-prereq"],
    coverage: { targetRefs: ["critical"] }
  });
  const ordinary = makeNeed("ordinary", {
    urgency: 0.2,
    importance: 0.2,
    coverage: { targetRefs: ["other"] }
  });

  const decision = chooseNeedForTeam([blocked, ordinary], {
    satisfiedNeedIds: []
  });

  assert.equal(decision.selectedNeedId, "ordinary");
  assert.equal(
    needFeasibility(blocked, { satisfiedNeedIds: [] }).reason,
    "dependencies_unsatisfied"
  );

  const unblocked = chooseNeedForTeam([blocked, ordinary], {
    satisfiedNeedIds: ["need-prereq"]
  });
  assert.equal(unblocked.selectedNeedId, "blocked");
});

test("P3b allocator: already-covered complementary Need cannot win by score", () => {
  const covered = makeNeed("covered", {
    urgency: 1,
    importance: 1,
    coverage: { targetRefs: ["critical"] }
  });
  const open = makeNeed("open", {
    urgency: 0.1,
    importance: 0.1,
    coverage: { targetRefs: ["secondary"] }
  });

  const responsibilities = [activeResponsibility("covered")];
  const ranked = rankNeedsForTeam([covered, open], {
    existingResponsibilities: responsibilities
  });

  assert.deepEqual(ranked.map((row) => row.need.id), ["open"]);
  assert.equal(
    needFeasibility(covered, {
      existingResponsibilities: responsibilities
    }).reason,
    "already_covered"
  );
});

test("P3b allocator: independent duplication has an explicit live-lease cap", () => {
  const verify = makeNeed("verify", {
    redundancyPolicy: "independent_duplicate",
    coverage: { targetRefs: ["auth"] }
  });
  const responsibilities = [
    activeResponsibility("verify", { id: "r1", assignmentVersion: 1 }),
    activeResponsibility("verify", { id: "r2", assignmentVersion: 2 })
  ];

  const state = needFeasibility(verify, {
    existingResponsibilities: responsibilities,
    maxIndependentDuplicates: 2
  });

  assert.equal(state.feasible, false);
  assert.equal(state.reason, "independent_duplicate_cap_reached");
  assert.equal(state.liveResponsibilityCount, 2);
});

test("P3b allocator: deterministic ties resolve by Need id", () => {
  const b = makeNeed("b", { coverage: { targetRefs: ["b"] } });
  const a = makeNeed("a", { coverage: { targetRefs: ["a"] } });

  const decision = chooseNeedForTeam([b, a]);
  assert.deepEqual(decision.ranked.map((row) => row.needId), ["a", "b"]);
});

test("P3b allocator: selection and situated agent assignment remain separate evidence", () => {
  const highOverlap = makeNeed("overlap", {
    urgency: 0.9,
    importance: 0.9,
    coverage: {
      targetRefs: ["auth"],
      mutationScopes: ["auth"]
    },
    requirements: {
      capabilities: ["implement"],
      contextRefs: ["src/auth.mjs"]
    }
  });

  const novel = makeNeed("novel", {
    urgency: 0.6,
    importance: 0.6,
    coverage: {
      targetRefs: ["payments"],
      mutationScopes: ["payments"]
    },
    requirements: {
      capabilities: ["implement"],
      contextRefs: ["src/payments.mjs"]
    }
  });

  const teamNeed = makeNeed("team", {
    coverage: {
      targetRefs: ["auth"],
      mutationScopes: ["auth"]
    }
  });

  const result = allocateNextResponsibility({
    needs: [highOverlap, novel],
    teamNeeds: [teamNeed],
    candidates: [
      {
        id: "strong-cold",
        capabilities: ["implement"],
        capabilityScores: { implement: 0.96 },
        contextRefs: [],
        available: true
      },
      {
        id: "situated",
        capabilities: ["implement"],
        capabilityScores: { implement: 0.85 },
        contextRefs: ["src/payments.mjs"],
        available: true
      }
    ],
    matcherOptions: { mode: "capability_situated" },
    authorityForNeed: () => ({
      investigate: true,
      propose: true,
      execute: true,
      requestHelp: false,
      mutateScopes: ["payments"]
    }),
    leaseForNeed: () => ({
      offeredAt: "2026-09-28T14:01:00.000Z",
      renewAfter: "2026-09-28T14:06:00.000Z",
      expiresAt: "2026-09-28T14:11:00.000Z"
    })
  });

  assert.equal(result.status, "assigned");
  assert.equal(result.needDecision.selectedNeedId, "novel");
  assert.equal(result.assignment.need.id, "novel");
  assert.equal(result.assignment.decision.selectedCandidateId, "situated");
  assert.equal(result.assignment.responsibility.assigneeId, "situated");
});

test("P3b allocator: no eligible Need returns an explicit idle decision", () => {
  const terminal = makeNeed("done");
  terminal.status = "satisfied";

  const result = allocateNextResponsibility({
    needs: [terminal],
    candidates: [],
    leaseForNeed: () => ({
      offeredAt: "2026-09-28T14:01:00.000Z",
      renewAfter: "2026-09-28T14:06:00.000Z",
      expiresAt: "2026-09-28T14:11:00.000Z"
    })
  });

  assert.equal(result.status, "no_eligible_need");
  assert.equal(result.needDecision.selectedNeedId, null);
  assert.equal(result.assignment, null);
});

