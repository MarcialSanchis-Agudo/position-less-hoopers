# CoordinationTarget

`CoordinationTarget` is PLH's structured description of the team configuration the system is trying to realize from the current authoritative state.

It separates **target discovery** from **agent execution**.

```text
authoritative state S_t
        ↓
CoordinationTarget T_t
        ↓
Needs / coverage obligations
        ↓
Responsibilities
        ↓
agent execution
        ↓
evidence + new state
```

## Why not only scalar utility?

A scalar score can conceal pathological team configurations.

For example, a configuration might have high aggregate utility while:

- a critical Need remains uncovered,
- conflicting mutation scopes are active,
- required independent verification is absent,
- evidence obligations cannot be discharged.

A CoordinationTarget therefore carries both:

- an optional score for ranking feasible targets,
- structural constraints that define admissibility.

## Current reference fields

```text
CoordinationTarget {
  id
  goalId
  stateVersion
  generatedBy

  requiredCoverage[]
  assignment{}

  constraints {
    maxUncoveredCriticalNeeds
    maxMutationContention
    maxConcurrentResponsibilities
    budgetEnvelope
  }

  evidenceObligations[]
  exitConditions[]
  score
}
```

The target is bound to a specific authoritative `stateVersion`.

A later state version requires target regeneration rather than silently reusing an old configuration.

## Authoritative state vs Goal vs rules

PLH keeps these concepts distinct.

### Authoritative state

What is canonically true now.

Examples in basketball:

- score,
- clocks,
- possession,
- ball handler,
- observed player/defender positions,
- observed defensive action,
- live/dead-ball state.

Examples in an agent runtime:

- persisted Goal version,
- active workers,
- workspace version,
- admitted Needs,
- active Responsibilities,
- tool/permission facts,
- verified evidence.

### Goal

What the system is trying to achieve.

Examples:

- maximize expected possession value,
- satisfy an external software contract,
- restore a failed service.

### Rules / policy

Which transitions or actions are allowed.

Examples:

- basketball rules,
- workspace mutation authority,
- concurrency constraints,
- evidence requirements.

### Beliefs

Uncertain hypotheses are not authoritative state merely because an agent produced them.

They become authoritative only through the system's explicit admission/evidence machinery.

## Relation to target/execution separation

PLH uses CoordinationTarget as a systems-level abstraction:

> the coordination system constructs a state-responsive target; models execute bounded temporary Responsibilities toward it.

The current reference implementation keeps target construction deterministic and inspectable.

