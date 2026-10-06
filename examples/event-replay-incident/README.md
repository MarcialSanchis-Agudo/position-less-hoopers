# Event Replay Incident

A prospective paper-evaluation TaskPack for deterministic event-stream reconciliation.

The public seed implements contract v1. Later contracts add:

- v2: minimum sequence cutoffs, blocked aggregates, and same-sequence conflict resolution;
- v3: prerequisite dependencies, deterministic readiness ordering, and cycle/missing-dependency failure.

The TaskPack contains clean, hidden-contract, external-mutation, and worker-loss scenario definitions, an external grader, and v2/v3 reference solutions.

This TaskPack is frozen before real-agent outcomes and should not be tuned after inspecting them.

