# PLH Figure and Table Plan

Figures should answer questions, not decorate the paper.

## Figure 1 — Hoopers Arena: Last Possession 5v5

Purpose:

Make the role-first vs need-first distinction concrete.

The same five players face man coverage and then a hard trap. The authoritative state change produces a different CoordinationTarget and a different set of functions.

Current artifact:

`artifacts/figures/hoopers-arena-last-possession.svg`

The controlled study enumerates all 120 assignments and reports exact oracle regret under the declared Hoopers Arena utility.

## Figure 2 — Role-first vs need-first architecture

Purpose:

Show the abstract conceptual difference:

```text
predefined roles → assign agents

vs

state → CoordinationTarget → Need → temporary Responsibility
```

Status: design figure needed.

## Figure 2 — CoordinationField / the court

Purpose:

Show agents, active work, coverage, overlap, contention, evidence gaps.

Current development artifact:

`artifacts/figures/p0-courtshift-worker-loss.svg`

Final version should use a real ORCA trace.

## Figure 3 — Deterministic PLH coordination cycle

Purpose:

Show the executable P2.5 loop:

```text
state
 → NeedProposal
 → admitted Need
 → candidate matching
 → Responsibility lease
 → execution
 → evidence check
 → satisfied OR reopened
```

Important visual distinction:

- Responsibility is temporary,
- Need survives failed/insufficient execution,
- evidence gates satisfaction.

Current artifact:

`artifacts/figures/p2-coordination-cycle.svg`

Status: generated directly from current P2.5 semantics.

## Figure 4 — Situatedness mechanism

Purpose:

Show why the highest-capability agent is not always the highest-utility candidate.

Current development artifacts:

- `p1-context-calibration.svg`
- `p1-situatedness-sensitivity.svg`

Likely appendix/development figures after real evidence exists.

## Figure 5 — Context-loss crossover

Purpose:

Show the central P1 tradeoff:

- capability-only better when context reload is cheap,
- situated assignment better when context reload is expensive.

Current synthetic prototype:

`artifacts/figures/p1-context-cost-crossover.svg`

Target paper version:

same plot shape using real-agent warm/cold estimates or empirically calibrated cost buckets.

## Figure 6 — CourtShift perturbation timeline

Purpose:

```text
perturbation
 → coverage loss
 → Need admitted
 → responsibility reassigned
 → useful work resumes
 → externally verified completion
```

Primary quantity: recovery latency.

Status: requires P4 + real traces.

## Figure 7 — Clean→perturbed degradation

Compare B0/B1/B2/B3/P.

Plot:

- success,
- degradation from clean,
- confidence intervals.

Status: held-out evaluation.

## Figure 8 — Coverage vs redundant effort

Purpose:

Test spacing.

Status: P3.

## Tables

### Table 1 — Conditions

Exactly what differs and what is controlled.

### Table 2 — Main held-out results

Primary endpoints + cost/latency.

### Table 3 — Ablations

- no locality,
- no spacing,
- no switching,
- no hysteresis,
- capability-only,
- no independent verification.

### Table 4 — Governance/consistency events

- stale-state actions,
- conflict attempts,
- denied commits,
- evidence failures,
- human interventions.

