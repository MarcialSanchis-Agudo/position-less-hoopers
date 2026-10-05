# P1 Situatedness Sensitivity

## Purpose

The P1 matcher currently uses a frozen situatedness coefficient of `0.35`.

The calibration experiment shows that this is equivalent to assuming a fully situated candidate may compensate for roughly `0.35` points of raw capability disadvantage when other terms are equal.

This sensitivity experiment asks whether that coefficient is robust across different possible real costs of context loss.

## Synthetic setup

We vary:

- situatedness matcher weight from 0.00 to 0.50,
- capability gap from 0.00 to 0.50,
- true missing-context penalty.

The matcher sees only the candidate state and its configured coefficient.

It does **not** observe the synthetic true missing-context penalty.

## Result from the default synthetic grid

For equally weighted true missing-context penalties:

```text
0.10
0.20
0.30
0.40
```

the lowest synthetic mean regret occurs at situatedness weights:

```text
0.25 and 0.30
```

The current frozen `0.35` coefficient is close, but slightly more locality-aggressive than the synthetic optimum.

This is not a reason to tune it to 0.25 or 0.30.

It is evidence that the coefficient should be tied to an empirical estimate of context-loss cost rather than chosen aesthetically.

## Experimental consequence

Before held-out real-agent evaluation, measure the cost of forcing an agent to reconstruct missing context.

Candidate measurements:

- additional input/output tokens,
- time to first useful edit/action,
- total completion latency,
- task success degradation,
- number of repeated reads/tool calls,
- incorrect stale-state actions.

Use development tasks only to estimate or bracket the situatedness coefficient.

Then freeze either:

1. one coefficient, or
2. a predeclared sensitivity range

before final held-out results are inspected.

