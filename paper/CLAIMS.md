# PLH Claim Discipline

This file separates claims that are currently demonstrated, claims under test, and claims that must not yet appear in abstracts/conclusions.

## Demonstrated by released deterministic code

We may say:

- PLH includes a first-class, state-version-bound CoordinationTarget abstraction separating structured target discovery from temporary agent execution.
- Hoopers Arena provides a controlled 5v5 mechanism study in which all 120 feasible assignments are exhaustively enumerated, allowing exact oracle regret under the declared scenario utility.
- In the strengthened Last Possession v2 scenario, PLH and a globally optimized dynamic-predefined-function baseline both attain zero oracle regret, while fixed-position and fixed-archetype baselines have positive regret. The single trap therefore does not distinguish function emergence from strong dynamic reassignment.
- In the frozen three-shift Hoopers Arena mechanism suite (hard trap, switch mismatch, paint collapse), the globally optimized dynamic-predefined-function baseline matches the oracle in 1/3 shifts and has mean oracle regret about 0.392 under the declared benchmark utility. Fixed-position and fixed-archetype baselines each average about 0.373 regret. This is controlled mechanism evidence only; the suite is hand-designed and PLH defines the assignment oracle under its state-derived utility.

- PLH defines a deterministic CoordinationField projection.
- The reference implementation distinguishes structural overlap from explicit contention.
- The reference implementation supports static, capability-only, and capability+situatedness candidate matching.
- Candidate feasibility is checked before scoring.
- Assignment decisions are deterministic under equal inputs.
- PLH includes first-class deterministic Need admission with normalization, fingerprinting, deduplication, state-version identity, lifecycle, and evidence obligations.
- PLH includes temporary Responsibility leases with explicit authority, assignment versions, expiry/renewal, and terminal lifecycle outcomes.
- The P2.5 reference cycle connects Need → candidate matching → Responsibility → evidence-gated Need satisfaction.
- Unresolved work is preserved: completing/releasing/revoking a Responsibility without satisfying its Need reopens the Need rather than silently erasing it.
- Duplicate live coverage is blocked by default and allowed explicitly for `independent_duplicate` Needs.
- PLH measures semantic Need overlap across targets, hypotheses, evidence types, and mutation scopes.
- Semantic overlap is classified separately as potential redundancy, mutation-contention risk, or intentional independent verification.
- PLH computes marginal semantic coverage gain for candidate Needs relative to currently active Needs.
- PLH includes a deterministic team-aware next-Need allocator with explicit hard feasibility constraints and auditable utility components.
- Need selection and agent selection remain separate decisions, allowing independent ablations of spacing and situatedness.
- PLH models emergent help as governed child Needs derived from blocked/uncertain situations rather than persistent helper roles.
- Help signals pass through the same deterministic Need validation, fingerprinting, deduplication, and state-version admission path.
- PLH includes deterministic Responsibility switching with explicit hysteresis margin, minimum tenure, cooldown, and forced-switch paths for failed/unavailable/blocked/stalled assignees.
- Switching preserves Need identity and increments assignmentVersion on the replacement Responsibility.
- PLH includes a deterministic bounded AdaptiveRegion that composes Need admission, team-aware allocation, situated matching, emergent help, switching, evidence-gated completion, and typed exit conditions.
- An AdaptiveRegion cannot exit while declared evidence is missing or any admitted Need remains nonterminal.
- PLH includes an experimental pressure-trigger layer that accumulates nonnegative coordination pressure, supports bounded deterministic cascades, and can emit group triggers when coupled Needs jointly cross a threshold.
- The pressure-trigger layer emits reevaluation signals only; it does not itself grant authority or commit state.
- PLH includes a provider-neutral RunnerPort contract that scopes execution to a specific Need/Responsibility and translates executor results back into governed completion/help/failure signals.
- The repository includes Checkout Incident Real v0: a prepared executable workspace, external contract grader, clean/perturbed scenarios, deterministic perturbation injector, and a known reference solution that satisfies contract versions v2/v3.
- The local RunnerPort adapter executes provider-neutral requests with captured process telemetry and never fabricates evidence for failed executions.
- The same PLH coordination core and generic TaskPack harness currently support two distinct task domains: checkout integration and configuration migration, without task-specific changes to Need, Responsibility, allocation, help, switching, AdaptiveRegion, or RunnerPort semantics.
- PLH includes a file-based CommandAgent protocol and clean-matrix runner that execute the same TaskPack/policy cells through a provider-neutral adapter boundary.
- PLH also includes a two-phase perturbed-cell/matrix runner for contract reveal and external contract mutation: the initial contract must pass, the post-perturbation target contract must fail before recovery, and only a subsequent recovery execution may restore authoritative correctness.
- Worker-loss runs are explicitly excluded from scientific analysis until the runtime can interrupt a live executor rather than simulate loss between atomic executions.
- Agent-reported evidence is explicitly separated from authoritative grader evidence; an executor that merely claims completion receives no authoritative evidence unless the external grader succeeds.
- The repository contains reproducible synthetic calibration, sensitivity, switching, trigger, and perturbation experiments.
- The repository provides schemas for experiment manifests and warm/cold context-reload runs.

## Demonstrated only in synthetic development experiments

We may say, clearly labeled as synthetic:

- situated assignment substantially reduces context reload frequency in the current simulator;
- capability-only performs better when synthetic context loss is cheap;
- capability+situatedness performs better when synthetic context loss is expensive;
- the current simulator has a crossover near 0.159 context-penalty units;
- a frozen situatedness weight of 0.35 is slightly locality-aggressive under the current mixed synthetic calibration grid.

These are mechanism-development findings, not real-agent performance findings.

## Demonstrated only as operator smoke

We may say:

- the warm/cold development harness can prepare, modify, grade, and persist 10 matched local workspaces end-to-end.

We may not use the operator smoke to compare warm vs cold performance because both conditions were solved inside one persistent assistant context.

## Claims under test

Do not state as findings yet:

- situatedness improves real-agent task efficiency;
- PLH improves real-agent success under perturbation;
- PLH reduces recovery latency;
- PLH reduces accidental duplication (P3a measures it; reduction requires P3b experiments);
- Need-first coordination outperforms dynamic predefined-role assignment;
- PLH preserves governance at scale without additional consistency failures.

## Prohibited general conclusions without much stronger evidence

Do not write:

- "PLH is superior to role-based agents."
- "Position-less teams are always better."
- "Situatedness is more important than capability."
- "PLH solves multi-agent coordination."
- "CourtShift is a standard benchmark."

Any final claim must identify:

- evaluated task population,
- evaluated perturbations,
- models/providers,
- resource constraints,
- metric,
- uncertainty.

