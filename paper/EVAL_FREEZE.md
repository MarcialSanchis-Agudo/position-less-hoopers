# PLH v0.1 Evaluation Freeze

This file marks the boundary between **development** and **held-out evaluation**.

The freeze occurs after real-agent development experiments on:

- Checkout Incident,
- Config Migration Incident.

Both development TaskPacks use matched event-stream structure. Their cross-task replication is useful, but it is not yet a held-out test of trigger robustness.

From this point onward, the following are frozen for the main v0.1 evaluation:

- P1 matcher weights,
- P3b allocator weights,
- P4 hysteresis parameters,
- Pressure thresholds and cascade semantics,
- event-policy definitions.

Exact values are machine-readable in:

`benchmarks/courtshift/eval-freeze-v0.1.json`

## Rule

Held-out TaskPacks and event streams may vary task semantics, perturbation type, event timing, event count, signal ordering, and pressure distribution.

They must **not** cause PLH parameters to be changed after their outcomes are inspected.

If a software bug requires a semantic change, affected held-out runs must be discarded and rerun under a new freeze ID.

## Development result boundary

Current Sonnet 5.5 development evidence spans two TaskPacks and five fresh-session replicates per TaskPack.

It supports the observation that, on these matched development streams, pressure-triggered PLH preserved recovery while reducing agent invocations relative to always-reactive greedy coordination.

It does not yet establish:

- held-out generalization,
- robustness to different event-stream distributions,
- superiority to dynamic predefined-function B3 in real-agent tasks,
- general multi-agent superiority.

