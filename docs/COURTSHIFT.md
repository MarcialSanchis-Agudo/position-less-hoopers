# CourtShift

CourtShift is the planned perturbation layer for testing PLH under changing state.

Initial perturbation classes:

1. worker loss
2. external workspace mutation
3. hidden integration failure
4. requirement shift
5. provider/candidate unavailability
6. conflicting concurrent mutation
7. assumption invalidation
8. late independent refute
9. stale context

Each scenario must have:

- a clean twin,
- deterministic injection semantics,
- an external correctness grader,
- a machine-readable recovery criterion,
- the same perturbation presented to every coordination condition.

CourtShift is not yet claimed as a standalone benchmark. That name should only be used for a public benchmark release once non-PLH runners can consume its scenario format.

