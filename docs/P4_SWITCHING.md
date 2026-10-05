# P4 — Switching and Rotations

P4 decides when an active Responsibility should move to another agent.

The normal rule is:

```text
U(new, need) > U(current, need) + switchMargin
```

subject to minimum tenure and cooldown.

Operational failure is different: a failed, missing, unavailable, blocked, stalled, or otherwise infeasible current assignee may trigger a forced switch that bypasses hysteresis.

## Development policy

```text
switchMargin = 0.10
minTenureMs  = 120000
cooldownMs   = 180000
```

These are transparent development defaults, not optimized values.

## Invariant

A switch changes the Responsibility, not the Need.

The implementation:

1. revokes the old Responsibility,
2. reopens the same Need,
3. assigns a replacement Responsibility with assignmentVersion + 1,
4. records handoff origin and reason.

## Why hysteresis?

A greedy switcher may thrash when candidate scores oscillate slightly.

PLH should switch when the gain is meaningful or when the current worker cannot continue, not merely because another candidate is momentarily a little better.

## Comparison pilot

Use one identical candidate-state trace under:

- no_switch,
- greedy_switch,
- plh_hysteresis.

The trace should include:

1. a small score oscillation,
2. a genuine worker loss,
3. a recovery candidate.

Measure:

- switch count,
- unnecessary switch count,
- time uncovered after worker loss,
- context reload penalty,
- final correctness/evidence.

