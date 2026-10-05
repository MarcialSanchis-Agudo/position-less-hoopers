# P2 — Need + Responsibility

P2 introduces the first PLH objects that are not merely observational.

The purpose is to make the unit of coordination explicit:

```text
state
  ↓
NeedProposal
  ↓ deterministic validation + admission + deduplication
Need
  ↓
candidate matching
  ↓
Responsibility lease
```

## Need

A Need is an admitted, version-bound description of work that the current Goal state requires.

A Need is not an agent identity and not a persistent role.

The reference implementation includes:

- deterministic validation,
- canonical normalization,
- SHA-256 fingerprinting,
- deterministic IDs when no explicit ID is supplied,
- duplicate admission detection,
- lifecycle transitions,
- explicit evidence obligations.

The Need fingerprint includes the authoritative `stateVersion`.

This means the same objective discovered against a later state version is intentionally a distinct Need.

## NeedProposal

Workers may propose work, but a proposal is not authoritative.

`admitNeedProposal()` owns:

- validation,
- normalization,
- fingerprinting,
- deduplication,
- admission.

The agent proposes; deterministic code admits.

## Responsibility

A Responsibility is a **temporary lease** connecting:

- one admitted Need,
- one assignee,
- one assignment version,
- explicit authority,
- evidence obligations,
- lease timing.

Authority defaults to false.

The current authority surface is:

- investigate,
- propose,
- execute,
- request help,
- bounded mutation scopes.

Responsibility is deliberately separate from commit authority.

An agent being responsible for work does not imply it may commit arbitrary state changes.

## Lease lifecycle

```text
offered
  ↓
accepted
  ↓
active
  ↓
completed / released / revoked
```

All lease operations receive explicit timestamps. No hidden wall clock is read by the domain functions.

## Evidence

Completing a Responsibility does not automatically satisfy its Need.

Need satisfaction is separately gated by the Need's evidence obligations.

This separation is intentional:

```text
agent says work is done
       ≠
Need is authoritatively satisfied
```

## P2 invariants represented in code

1. Need precedes Responsibility.
2. Need admission is deterministic.
3. Duplicate proposals do not silently create duplicate authoritative Needs.
4. State version participates in Need identity.
5. Responsibility is temporary and versioned.
6. Authority is explicit.
7. Terminal Needs cannot receive new Responsibilities.
8. Completing a Responsibility does not itself satisfy a Need.
9. Evidence obligations gate Need satisfaction.
10. Domain transitions do not read the ambient clock.

## Not implemented in P2

P2 does not yet claim:

- semantic spacing,
- help,
- automatic switching,
- rotations,
- learned scheduling,
- multi-Need optimization.

Those remain later phases.

