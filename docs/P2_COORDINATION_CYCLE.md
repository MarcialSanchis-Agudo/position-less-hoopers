# P2.5 — Deterministic Coordination Cycle

P2.5 connects the pieces already implemented in P1/P2:

```text
Need
  ↓
candidate matching
  ↓
Responsibility offer
  ↓
accept + activate
  ↓
execution result
  ↓
evidence check
  ↓
Need satisfied OR reopened
```

This is the first complete PLH coordination cycle.

## Need → matcher

`needToMatchRequest()` converts an admitted Need's nested requirements into the P1 matcher contract.

This keeps the authoritative domain object separate from the matching implementation.

Persistent role labels are not required.

## Assignment

`assignNeed()`:

1. rejects terminal Needs,
2. prevents accidental duplicate coverage unless the Need explicitly requests `independent_duplicate`,
3. converts Need requirements into a match request,
4. applies P1 feasibility and ranking,
5. emits one Responsibility offer,
6. moves an uncovered Need to `assigned`.

When no candidate is feasible, the Need becomes `blocked` rather than disappearing.

## Start

`startResponsibility()`:

- accepts the offer,
- activates the lease,
- moves the Need to `active`.

The domain functions receive timestamps explicitly; they do not read the ambient clock.

## Finish

`finishResponsibility()` deliberately separates two facts:

```text
Responsibility completed
       vs
Need satisfied
```

If evidence obligations are met:

```text
Responsibility → completed
Need           → satisfied
```

If evidence obligations are missing:

```text
Responsibility → completed
Need           → open
```

The Need is reopened so unresolved coverage cannot silently disappear.

This is the precursor to P4 switching/reassignment.

## Release / revoke

If a Responsibility is released or revoked before completion, its unresolved Need returns to `open`.

Again, responsibility movement does not erase work.

## Duplicate coverage

P2.5 is conservative:

- `independent_duplicate` may receive multiple live Responsibilities;
- all other redundancy policies prevent another live Responsibility at this phase.

P3 will introduce semantic complementary coverage and team-level spacing.

## Events

Cycle functions return deterministic event records such as:

- `AssignmentDecision`
- `AssignmentDeferred`
- `ResponsibilityActivated`
- `ResponsibilityCompleted`
- `ResponsibilityReleased`
- `ResponsibilityRevoked`
- `NeedSatisfied`
- `NeedReopened`

These are returned values, not persisted global events. A runtime adapter may persist them.

