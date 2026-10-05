# P3c — Emergent Help

P3c models help as a new Need derived from a situation, not as a persistent helper identity.

The core sequence is:

```text
parent Responsibility encounters blockage/uncertainty
        ↓
non-authoritative Help signal
        ↓
Help signal → NeedProposal
        ↓
normal deterministic Need admission
        ↓
child Help Need
        ↓
normal P3b allocation + P1 situated matching
```

## Help signals

Supported initial signal kinds:

- blocked
- assumption invalidated
- unexpected state
- verification gap
- missing context

The signal carries:

- parent Need identity,
- Goal identity,
- authoritative state version,
- a concrete summary,
- optional capability/tool/context requirements,
- semantic coverage,
- evidence obligations,
- exit conditions.

## No helper role

P3c does not create a persistent `HelperAgent`, `RecoveryAgent`, or `Researcher` identity.

The support function emerges because the current state contains a new Need.

Any feasible agent may cover it.

## Admission discipline

Help signals are non-authoritative.

They are converted into ordinary Need proposals and pass through the same deterministic:

- validation,
- normalization,
- fingerprinting,
- deduplication,
- state-version binding,
- admission.

Repeated identical help signals therefore do not create duplicate authoritative work.

## Parent-child relation

The derived Help Need stores:

`parentNeedId`

This allows the system to inspect whether a parent Need still has unresolved support work.

A parent is considered ready to resume only after it has at least one help child and no active help child remains.

This is a coordination signal, not an automatic state transition.

## Reallocation

P3c intentionally reuses the existing allocator.

Once admitted, a help Need is just a Need:

```text
Help Need
  ↓
team-aware Need ranking
  ↓
situated candidate matching
  ↓
temporary Responsibility
```

This is the computational version of a basketball help rotation.

## Not yet switching

P3c does not revoke or move the parent Responsibility automatically.

P4 will decide whether:

- the original agent continues,
- pauses,
- hands off,
- or is replaced.

P3c only establishes the support-work object and its lifecycle.

