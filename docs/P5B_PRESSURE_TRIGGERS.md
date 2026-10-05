# P5b — Sandpile-Inspired Coordination Pressure

P5b is an experimental trigger layer inspired by threshold/cascade dynamics.

It is not an optimizer and does not inherit the mathematical guarantees of the source analogy.

## Mapping

```text
sand grain / gradient pressure
        ↓
coordination pressure increment

unstable node
        ↓
Need worth reevaluating now

toppling
        ↓
emit coordination trigger

correlation edge
        ↓
state coupling / dependency propagation

group toppling
        ↓
joint coordination trigger when no single Need crosses threshold
```

The trigger layer does not directly mutate authoritative Goal state.

It emits reasons for the existing deterministic PLH mechanisms to reevaluate allocation, help, switching, or verification.

## Why useful?

Without a trigger policy, a system can fall back to:

- central periodic polling,
- constant LLM replanning,
- noisy greedy reactions to every small state change.

Pressure accumulation gives a different option:

- small signals accumulate,
- no action below threshold,
- meaningful state changes trigger reevaluation,
- correlated changes can cascade,
- coupled Needs can trigger a group-level reaction.

## Group triggers

Group triggers are especially relevant to PLH.

Two Needs may each be below an individual action threshold while their combined coordination value justifies a joint response.

Example:

- implementation uncertainty = 0.55,
- verification gap = 0.55,
- individual threshold = 1.0,
- group threshold = 1.0.

Neither Need triggers alone.

The pair triggers a joint coordination event.

## Safety / claim discipline

The sandpile source has exact monotonicity/termination guarantees in its specific linear-readout squared-loss setting.

PLH does not claim those guarantees for agent coordination.

The reference P5b implementation instead:

- uses explicit nonnegative pressure,
- deterministic thresholds,
- bounded cascade steps,
- explicit propagation coefficients,
- returns triggers rather than committing actions.

P5b should be evaluated as a coordination-trigger policy, not presented as a mathematically equivalent sandpile optimizer.

