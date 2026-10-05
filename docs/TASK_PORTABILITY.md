# Task Portability

PLH coordination semantics are task-independent.

A TaskPack supplies only the task-specific boundary:

- seed workspace,
- active external contract path,
- versioned contracts,
- external grader,
- perturbation scenarios.

The PLH core does not change.

## Current TaskPacks

### Checkout Incident

Domain: coding/integration.

Tests adaptation to:

- hidden payment-callback requirements,
- external contract mutation,
- worker loss.

### Config Migration Incident

Domain: coding/data migration.

Tests adaptation to:

- nested configuration schema changes,
- hidden migration requirements,
- external contract mutation,
- worker loss.

Both TaskPacks use the same:

- Need model,
- Responsibility leases,
- team-aware allocation,
- Help signals,
- switching,
- AdaptiveRegion,
- pressure triggers,
- RunnerPort,
- generic TaskPack preparer/injector/grader wrapper.

## What this demonstrates

The current implementation demonstrates structural portability:

> PLH can coordinate different task domains without changing its coordination semantics.

It does **not** yet demonstrate performance generalization.

Performance generalization requires real model runs across multiple TaskPacks under matched conditions.

## Paper implication

The evaluation should avoid relying on one benchmark family.

A stronger design is:

- multiple TaskPacks,
- same coordination policies,
- same model pool,
- matched budgets/tools,
- external graders,
- clean and perturbed twins.

This allows us to ask whether an observed coordination effect transfers across task domains rather than being specific to one checkout example.

