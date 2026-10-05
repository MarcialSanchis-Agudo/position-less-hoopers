# P1 Context-Cost Regime Sweep

## Question

At what real context-reload cost should capability+situatedness overtake capability-only assignment?

This synthetic sweep varies the true missing-context penalty while keeping:

- the matcher weights frozen,
- the generated team episodes matched across policies,
- the agent capability distributions fixed for each seed.

## Outputs

For each context penalty:

- static mean utility,
- capability-only mean utility,
- situated mean utility,
- situated minus capability utility,
- context reload rate for each policy.

The sweep also estimates the synthetic crossover point where situated assignment first becomes better than capability-only.

## Why this matters

The crossover is not a constant of PLH.

It is a property of:

- agent capability distribution,
- task/context distribution,
- context retention window,
- matcher coefficients,
- actual cost of reconstructing context.

The real-agent experiments should estimate the empirical analogue of this crossover.

## Paper use

A real-agent version of this curve would be a strong result:

- left of the crossover, raw capability dominates;
- right of the crossover, situatedness becomes worth more than the capability sacrifice.

This directly expresses the Position Less Hoopers principle as a measurable tradeoff rather than a metaphor.

