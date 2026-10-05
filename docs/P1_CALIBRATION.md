# P1 Calibration Experiment

## Question

How much raw capability advantage should be required to overcome context locality?

With the frozen P1 coefficients and all other terms equal:

```text
score = capability + 0.35 * situatedness
```

A fully situated candidate can therefore overcome up to **0.35** points of capability disadvantage.

That is a strong assumption.

## Why this matters

The correct locality weight should be related to the *real cost of missing context*.

If reconstructing context only costs the equivalent of 0.10 utility points, a 0.35 locality coefficient will over-select local but weaker agents.

If missing context costs 0.40 utility points, the same coefficient can be directionally appropriate.

The synthetic calibration grid therefore varies:

- capability gap,
- true missing-context penalty,

while keeping the matcher coefficient frozen.

The matcher never observes the synthetic truth penalty.

## Interpretation

This experiment is not evidence for a particular coefficient.

It identifies the empirical quantity we need to estimate in real-agent experiments:

> **What is the effective cost of context reload / loss of situatedness?**

That cost can be measured later in tokens, latency, failure probability, and externally graded task success.

## Implication for the paper

The P1 situatedness coefficient should not be presented as a tuned magic number.

The paper should either:

1. estimate it from development tasks and freeze it before held-out evaluation, or
2. report a sensitivity analysis across a predeclared coefficient range.

The held-out evaluation must not choose the coefficient after seeing test-set outcomes.

