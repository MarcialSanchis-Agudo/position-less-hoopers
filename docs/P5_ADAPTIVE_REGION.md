# P5a — Read-and-React Adaptive Region

P5a introduces a deterministic region boundary around PLH's already-implemented mechanisms.

The region does not replace a workflow.

It is a bounded tactical interval inside a larger strategic workflow.

```text
enter adaptive region
       ↓
authoritative state
       ↓
admit Needs
       ↓
team-aware allocation
       ↓
temporary Responsibilities
       ↓
help / reassignment / evidence
       ↓
typed exit conditions
       ↓
leave adaptive region
```

## Region state

An AdaptiveRegion stores:

- Goal ID,
- authoritative state version,
- admitted Needs,
- Responsibilities,
- evidence refs,
- typed exit conditions,
- deterministic event records,
- entered/exited timestamps.

## Exit rule

A region may exit only when:

1. every declared exit condition has matching evidence, and
2. no nonterminal Need remains.

This prevents the enclosing workflow from resuming while tactical work is silently unresolved.

## Composition

P5a does not invent new coordination semantics.

It composes:

- P2 Need admission,
- P3b team-aware Need selection,
- P1 situated candidate matching,
- P2 Responsibility leases,
- P3c emergent help,
- P4 switching,
- evidence-gated Need completion.

## Event-driven use

A runtime can call the region functions in response to:

- workflow entry,
- deterministic sensor events,
- Help signals,
- Responsibility lifecycle events,
- workspace/version changes,
- worker loss,
- verification evidence.

No giant polling LLM is required.

## Current scope

P5a is a deterministic state/replay kernel.

It does not spawn real workers.

A runtime such as ORCA should adapt its persisted events into these functions and persist the returned PLH events.

