# Hoopers Arena

Hoopers Arena is PLH's controlled coordination mechanism study.

It is intentionally separate from the real-agent CourtShift evaluation.

## Last Possession 5v5

Scenario:

- tie game,
- 12 seconds remaining,
- five offensive agents,
- five observed defenders,
- initial man coverage,
- defense changes to a hard two-player trap with weak-side rotation.

The authoritative state change causes the active functions themselves to change.

### Initial state

- primary creation,
- ball screen,
- strong-side spacing,
- weak-side spacing,
- rim pressure.

### Trap state

- ball security,
- release outlet,
- short-roll connector,
- weak-side lift,
- rim window.

No permanent player role is required by PLH.

## Exact oracle

Five agents cover five Needs.

Therefore the assignment space is:

`5! = 120`

Hoopers Arena enumerates every feasible assignment and returns the maximum-utility CoordinationTarget.

This makes exact oracle regret available:

```text
OracleRegret(policy) =
  U(T*) - U(T_policy)
```

where `T*` is the exhaustive optimum under the declared scenario utility.

## Current scenario result

Trap-state assignments:

### PLH oracle

- A → ball security
- B → release outlet
- C → short-roll connector
- D → weak-side lift
- E → rim window

### Fixed-position / dynamic-predefined-role baseline

- A → ball security
- D → release outlet
- C → short-roll connector
- B → weak-side lift
- E → rim window

Current v2 utility:

- PLH oracle regret: 0
- globally optimized dynamic-predefined-function regret: 0
- fixed-archetype regret: approximately 0.667
- fixed-position regret: approximately 0.667

The dynamic-predefined-function baseline exhaustively searches the same 120 assignments as PLH. Its zero regret in the hard-trap state is evidence that dynamic reassignment over a sufficiently good fixed ontology can be enough for some perturbations.

The frozen v1 state-shift suite then evaluates three qualitatively different perturbations without changing agent capabilities, nominal positions, or archetypes:

- hard trap,
- switch mismatch,
- paint collapse.

In that frozen suite, the dynamic-predefined-function baseline matches the oracle in 1/3 shifts and has mean oracle regret about 0.392. This is stronger than the single-trap comparison because the state-shift set is fixed before reading the aggregate result.

This is an exact result under the declared Hoopers Arena scoring model.

It is **not** a claim that the PLH assignment is optimal real basketball strategy.

## Why the dynamic-role baseline matters

The dynamic baseline may change which player fills creator/shooter/screener/wing/big.

It still chooses among a predefined role ontology.

PLH instead admits state-derived Needs whose function definitions can change after the trap.

This isolates the stronger PLH hypothesis:

> reassignment alone is not the contribution; state-derived function emergence is.

## Evaluation role

Hoopers Arena should support the paper's controlled mechanism section:

- exact regret,
- assignment churn,
- state-to-target transitions,
- role-first vs need-first ablations.

CourtShift remains the external-validity section:

- real model executors,
- external graders,
- real execution time,
- perturbation recovery,
- TaskPack portability.

