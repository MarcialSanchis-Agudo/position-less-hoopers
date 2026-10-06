# Publication Evaluation Set

This document defines the minimum example/evaluation surface PLH should complete before the first paper's main results are written.

## Why five software domains

The current repository now spans five distinct coding/coordination domains:

1. **Checkout Incident** — integration/idempotency behavior.
2. **Config Migration Incident** — data/config transformation.
3. **Deployment Rollout Incident** — constrained rollout planning.
4. **Access Policy Incident** — access-control reconciliation.
5. **Event Replay Incident** — event deduplication, filtering, and dependency-aware replay.

The first two are development/calibration tasks. Deployment Rollout has already been inspected and is retained as prior held-out/post-hoc mechanism evidence. Access Policy and Event Replay are the new **prospective evaluation tasks**: their task definitions, contracts, graders, scenarios, and reference solutions are frozen before any new Claude outcome is inspected.

The machine-readable freeze is:

`benchmarks/courtshift/publication-eval-set-v0.1.json`

## Minimum software evidence for the paper

For the two prospective TaskPacks, run matched conditions under the same executor family, model settings, tools, and resource constraints.

Required scenario classes:

- clean,
- hidden contract reveal,
- external contract mutation.

Worker loss remains deferred for paper claims until the runtime can interrupt a live executor.

Required baseline ladder:

- **B0** — strong single agent,
- **B1** — static workflow,
- **B2** — fixed specialist team,
- **B3** — dynamic assignment over a predefined role ontology,
- **P** — PLH / ORCA AX need-first coordination.

The important comparison is B3 vs P. Dynamic reassignment itself is not the novelty claim.

## Primary endpoints

- externally verified perturbed-task success,
- recovery latency.

Secondary endpoints:

- clean success,
- agent execution time,
- invocation count,
- suppressed execution count,
- context-misaligned assignment count,
- redundant execution time,
- switch churn,
- context reload.

Use at least five fresh-session replicates per task/condition for development-scale estimates. Final paper claims should emphasize paired task outcomes and uncertainty, not only pooled averages.

## Basketball examples

Hoopers Arena is the controlled mechanism/explanation section, not external validity.

Two suites now coexist:

- `state-shifts.json` — the original frozen three-shift v1 evidence: hard trap, switch mismatch, paint collapse.
- `state-shifts-expanded-v2.json` — a post-hoc explanatory six-shift catalog adding 2–3 zone, drop coverage, and scramble rotation.

The expanded catalog is useful for showing that the same five players can face different state-derived tactical functions without changing their capability profiles. It must not be presented as evidence that PLH is optimal basketball strategy.

## What is still missing after these examples

Before the paper is ready for a strong main-results section, the repo still needs:

1. implementation of B0/B1/B2/B3/P under a shared real-agent harness;
2. prospective runs on Access Policy and Event Replay without tuning after outcomes;
3. clean-vs-perturbed paired results;
4. a frozen analysis script/table generator;
5. at least one full artifact trace from result → manifest → event trace → config/code → grader;
6. release metadata: changelog/release notes, compatibility policy, and a tagged artifact version.

That is enough for a credible first paper. More domains or UI work are lower priority than finishing this matrix cleanly.

