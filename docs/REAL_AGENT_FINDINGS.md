# Real-Agent Development Findings

## Claude Code clean checkout matrix

Environment observed:

- provider: Anthropic
- CLI: Claude Code 2.1.285
- requested model: claude-sonnet-5-5
- requested effort: medium
- fresh session per cell

All four clean-condition labels passed the external checkout v2 grader.

This is a clean-parity result only.

## Important limitation discovered

The current clean matrix varies only the policy label. In a clean one-Need task, no policy-specific coordination event occurs.

More importantly, the current two-phase perturbed runner implements:

- static: no phase-2 recovery,
- greedy: phase-2 recovery,
- plh_direct: phase-2 recovery,
- plh_pressure: phase-2 recovery.

The three dynamic arms currently execute the same recovery action.

Therefore the current real-agent perturbed outputs support only this development statement:

> An external contract perturbation breaks the initial solution, and a fresh recovery execution can restore correctness while the static no-recovery baseline remains incorrect.

They do **not** support a comparative claim among greedy, PLH Direct, and PLH Pressure.

The existing rows must not be used as evidence that PLH improves recovery latency over greedy.

## Required next experiment

A policy-comparative runner must expose a stream of observable events and let each policy decide whether to trigger a coordination action at each event.

Example:

```text
minor warning
flaky test
ambiguous log
contract mismatch
explicit blocked signal
external mutation
```

Policies:

- react_every_event / greedy: recompute after every observable event,
- plh_direct: recompute only on direct semantic triggers,
- plh_pressure: accumulate pressure and recompute only on threshold/group triggers,
- static: never adapt after initial assignment.

Only then do coordination recomputation count, trigger latency, context reload, and downstream recovery cost become policy-specific real-agent measurements.

