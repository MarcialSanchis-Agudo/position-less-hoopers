# PLH P0 Metrics

Status: frozen for P0 instrumentation experiments.

These metrics describe the observed coordination field. They do **not** measure semantic spacing or prove PLH improves performance.

## activeAgentCount

Number of agents whose lifecycle is currently live or degraded-live according to the P0 projection policy.

## expectedWorkCount

Number of work units whose current state expects active coverage.

Waiting-for-human and terminal work do not enter the denominator.

## coveredWorkCount

Expected work with a live assigned agent that is not currently marked degraded.

## degradedWorkCount

Expected work with an assigned agent that is blocked or explicitly stalled.

## uncoveredWorkCount

Expected work without a live/recoverable assigned agent.

## coverageRatio

`coveredWorkCount / expectedWorkCount`.

Null when `expectedWorkCount = 0`.

Degraded work is not counted as fully covered.

## overlapPairCount

Count of emitted structural overlap records.

This is not a count of unique work pairs because one pair may emit both a read/write and write/write overlap.

## writeWriteOverlapCount

Count of structural overlap records where two active work units write the same normalized reference.

## readWriteOverlapCount

Count of structural overlap records where one active work unit reads a reference another active work unit writes.

## contentionCount

Count of authoritative contention records supplied by the underlying harness/state system.

Structural overlap alone does not create contention.

## conflictContentionCount

Count of contention records whose severity is `conflict`.

## evidenceGapCount

Count of explicit persisted verification/evidence gaps surfaced by the field.

## knownCostUsd

Known cumulative cost passed into the projection by the runtime/harness.

Null when unavailable.

## What P0 intentionally does not define

P0 does not define:

- semantic spacing,
- redundant-effort ratio,
- marginal team utility,
- context locality,
- recovery latency,
- Need coverage,
- switching benefit.

Those require later PLH phases or time-series experiment instrumentation.

