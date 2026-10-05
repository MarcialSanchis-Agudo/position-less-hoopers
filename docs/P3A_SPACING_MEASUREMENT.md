# P3a — Semantic Spacing Measurement

P3a measures team-level semantic coverage before PLH uses spacing to change assignments.

This preserves the experimental sequence:

> observe the game before coaching it.

## Why structural overlap is insufficient

P0 can detect read/write overlap.

P3a can additionally compare admitted Needs across four semantic coverage dimensions:

- target references,
- hypotheses,
- evidence types,
- mutation scopes.

## Pair classifications

### disjoint

The Needs share no semantic coverage item.

### potential_redundancy

The Needs overlap semantically without an explicit independent-verification policy.

This is a measurement, not proof of wasted effort.

### mutation_contention_risk

The Needs overlap in mutation scope.

This is still not authoritative contention. It is a risk signal.

Actual contention remains a deterministic harness/state fact.

### independent_verification

Overlap is explicitly intentional because at least one Need uses:

`redundancyPolicy = independent_duplicate`

This distinction is essential for PLH:

> redundancy may be waste, or it may be deliberate independent evidence.

## Team report

`teamSpacingReport()` returns:

- active Need count,
- semantic coverage sets,
- all pair classifications,
- overlap rate,
- accidental-overlap rate,
- independent-verification pair count.

## Marginal coverage

`marginalCoverageGain()` asks:

> What does this Need cover that the currently active Needs do not?

It reports novel:

- targets,
- hypotheses,
- evidence types,
- mutation scopes.

This is the first deterministic building block for the later team-utility scheduler.

## Claim discipline

P3a allows us to say:

- PLH measures semantic Need overlap and marginal coverage;
- intentional independent verification is separated from accidental overlap signals.

P3a does not yet allow us to say:

- PLH reduces duplication;
- PLH improves spacing;
- the scheduler optimizes team configuration.

Those require P3b scheduling experiments.

