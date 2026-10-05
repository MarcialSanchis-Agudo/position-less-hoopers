# P3b — Team-Aware Allocation

P3b is the first PLH mechanism where spacing measurements influence a coordination decision.

It deliberately separates two questions:

1. **Which Need should the team cover next?**
2. **Which agent should cover that Need?**

The first is team configuration.

The second is situated candidate matching.

## Hard feasibility before scoring

A Need is ineligible when:

- it is terminal,
- its dependencies are unsatisfied,
- it is already covered and does not permit independent duplication,
- it has reached the configured cap for independent duplicate Responsibilities.

No utility score overrides these constraints.

## Default P3b development utility

The first deterministic reference weights are:

```text
urgency                    +0.25
importance                 +0.25
expected information gain  +0.15
uncertainty                +0.05
marginal coverage          +0.30
independent verification   +0.15
accidental overlap         -0.20
mutation contention risk   -0.35
```

These coefficients are development defaults.

They are not claimed to be optimal and should be frozen before any synthetic comparison that uses them.

## Spacing terms

### Marginal coverage

How much semantic coverage the candidate Need adds beyond currently active team Needs.

### Independent verification

Semantic overlap that is explicitly requested through `independent_duplicate`.

This receives positive value rather than being penalized as duplication.

### Accidental overlap

Semantic overlap not explicitly requested as independent verification.

This is a penalty signal, not proof of wasted work.

### Mutation contention risk

Overlap in mutation scopes receives a stronger penalty.

It remains distinct from authoritative runtime contention.

## Deterministic ordering

Ties resolve by:

1. total team utility,
2. urgency,
3. importance,
4. Need ID.

No LLM performs the ranking.

## Allocation composition

`allocateNextResponsibility()` composes:

```text
chooseNeedForTeam()
       ↓
assignNeed()
       ↓
Responsibility offer
```

This preserves inspectability:

- Need-selection evidence is visible,
- candidate-ranking evidence is visible,
- the two decisions can be ablated independently.

## Not yet implemented

P3b does not yet:

- generate Help Needs,
- switch an active Responsibility,
- learn coefficients,
- globally optimize all Need-agent pairings.

It is a greedy next-allocation mechanism with explicit team-aware terms.

