# Position Less Hoopers — Paper Outline

Working title:

**Position Less Hoopers: Need-First Coordination for State-Responsive Multi-Agent Systems**

Optional conceptual subtitle:

**Responsibilities Are Events, Not Identities**

## Abstract skeleton

1. Problem: long-horizon agent systems often bind responsibilities to predefined identities/roles.
2. Proposal: PLH represents evolving work as Needs and assigns temporary Responsibilities according to capabilities, situatedness, and marginal team coverage.
3. Governance: fluid cognition is separated from deterministic commit authority/evidence/state consistency.
4. Method: compare matched role-first and need-first conditions under controlled mid-run perturbations.
5. Results: insert only after held-out experiments.
6. Artifact: open-source implementation + CourtShift perturbation layer + reproducible traces.

## 1. Introduction

Motivation:

- real work changes after execution begins;
- failures, new evidence, external mutations, and stale assumptions invalidate static allocations;
- dynamic assignment to predefined roles still assumes the ontology of functions is fixed in advance.

Research question:

> What changes when the unit of coordination is an evolving Need rather than a persistent role?

Contributions, subject to evidence:

- C1 need-first coordination model,
- C2 situated marginal assignment,
- C3 spacing/help/switching mechanisms,
- C4 separation of responsibility from deterministic commit authority,
- C5 perturbation-oriented evaluation protocol.

## 2. Related Work

Organize by concepts, not citation dump:

- role-based LLM teams,
- dynamic role assignment,
- graph/workflow orchestration,
- durable agent runtimes,
- verifier/refuter and evidence mechanisms,
- ecological dynamics / affordances / team coordination.

Novelty boundary:

Dynamic assignment itself is not the contribution.

## 3. Problem Formulation

Variables:

- authoritative state,
- Needs,
- candidates,
- AgentSituation,
- Responsibilities,
- budget/authority constraints.

Define role-first and need-first alternatives.

## 4. Architecture

- CoordinationField
- CapabilityProfile
- AgentSituation
- Need
- Responsibility lease
- Commit lease
- event-driven recomputation

## 5. Mechanisms

- candidate feasibility,
- situatedness,
- marginal team utility,
- spacing,
- help,
- switching/hysteresis,
- independent verification.

## 6. Safety and Governance

Core invariant:

> Fluid cognition; explicit commit authority.

Describe:

- schema/policy/evidence/state validation,
- permission boundaries,
- mutation scopes,
- stale-state/conflict checks,
- human authority.

## 7. Reference Implementation

PLH core + ORCA adapter.

Keep execution substrate separate from coordination semantics.

## 8. Experimental Design

Conditions:

- B0 strong single agent,
- B1 static workflow,
- B2 fixed specialist team,
- B3 dynamic predefined roles,
- P PLH.

Matched candidate pools/tools/budget/concurrency.

## 9. CourtShift

- perturbation taxonomy,
- clean twins,
- deterministic injection,
- recovery criteria,
- external graders.

## 10. Metrics

Primary:

- externally verified perturbed-task success,
- recovery latency.

Secondary:

- clean success,
- wall clock,
- tokens/cost,
- human interventions,
- uncovered critical need time,
- accidental redundant effort,
- independent verification effort,
- stale-state actions,
- conflicting commit attempts,
- switch churn,
- context reload.

## 11. Analysis

- task-paired comparisons,
- bootstrap confidence intervals,
- clean and perturbed results separately,
- absolute outcomes + degradation,
- resource-normalized results,
- sensitivity/ablation analysis.

## 12. Results

Do not prewrite conclusions.

## 13. Threats to Validity

- model effects dominate coordination effects,
- nondeterminism,
- task contamination,
- synthetic perturbation realism,
- situatedness proxy quality,
- coefficient tuning,
- limited task population,
- implementation bias.

## 14. Perspective: From Positionless Coordination to Positionless Learning

This paper studies **coordination-time positionlessness**:

```text
fixed-ish trained capabilities
        ↓
state-derived functions
        ↓
fluid temporary Responsibilities
```

The executors are already trained. PLH does not currently train them to become generalists.

A complementary research direction is **learning-time positionlessness**:

```text
state-derived responsibility diversity during training
        ↓
broader feasible function sets
        ↓
agents that retain heterogeneous strengths
while transferring across more functions
```

The hypothesis is not that every agent should become identical. Positionless learning should preserve useful specialization while weakening the link between specialization and responsibility ownership.

A future controlled experiment should compare:

- specialist curriculum,
- random-role rotation,
- state-derived PLH responsibility curriculum,

and evaluate both peak specialist performance and out-of-function transfer on held-out perturbations.

## 15. Artifact and Reproducibility

Map every result to public artifacts.

