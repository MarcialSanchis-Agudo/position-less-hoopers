# P1 Seeded Team Simulation

## Purpose

This is a Level-1 synthetic mechanism experiment.

It tests whether the three P1 assignment laws behave sensibly over a sequence of work rather than a single isolated decision.

It is **not** evidence of real-agent performance.

## Environment

Each episode contains:

- four agents,
- three capability dimensions,
- six context domains,
- a sequence of Needs,
- a bounded two-context working set per agent,
- periodic single-agent availability perturbations.

The policies see the same generated episode for a given seed.

## Policies

- static preference
- capability-only
- capability + situatedness

## Synthetic truth

Realized utility is:

```text
capability score
-
true missing-context penalty (when context is absent)
```

After executing work, the selected agent acquires the relevant context and keeps a bounded recent context window.

The matcher does not observe the true missing-context penalty.

## Expected qualitative behavior

When context reconstruction is expensive:

- situated assignment should reduce context reloads,
- situated assignment should improve realized utility.

When context reconstruction is very cheap:

- capability-only assignment can outperform situated assignment,
- because sacrificing raw capability for locality is unnecessary.

This is the behavior we want before real-agent testing: PLH should not imply that situatedness is always better.

## Real-agent translation

The synthetic `trueMissingContextPenalty` must eventually be replaced by empirical measurements such as:

- extra tokens used to reconstruct context,
- repeated file/tool reads,
- latency to first useful action,
- increased failure probability,
- stale-state errors.

The development-set estimate should be frozen before held-out evaluation.

