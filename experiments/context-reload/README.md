# Real Context-Reload Development Experiment

This directory turns the P1 warm-vs-cold protocol into executable local development tasks.

## Purpose

Measure how much extra work the **same model** performs when it must reconstruct task context from the repository rather than receiving a bounded context package.

This is a development/calibration experiment, not a held-out benchmark.

## Conditions

For each task, prepare a matched pair:

- `warm`: identical workspace + `PLH_CONTEXT.md`
- `cold`: identical workspace without `PLH_CONTEXT.md`

The task instructions are otherwise identical.

## Tasks

Five small deterministic coding tasks are included:

- `cr-001-route-policy`
- `cr-002-evidence-dedupe`
- `cr-003-budget-guard`
- `cr-004-state-version`
- `cr-005-overlap-pairs`

Each task has:

- a seed workspace,
- public task instructions,
- deterministic tests,
- a separate context package.

## Prepare workspaces

```bash
npm run context:prepare
```

This creates paired workspaces under:

```text
results/local/context-reload/
  cr-001-route-policy/
    warm/workspace/
    cold/workspace/
  ...
```

Warm workspaces receive `PLH_CONTEXT.md`. Cold workspaces do not.

## Run agents

Use fresh sessions.

Within a pair keep fixed:

- model/settings,
- tools,
- task prompt,
- budget,
- seed workspace.

Counterbalance warm/cold ordering across tasks.

The agent should work only inside its prepared workspace.

## Grade

Each task is graded by:

```bash
npm test
```

inside that prepared workspace.

Correctness should be recorded in a `context-reload-run.schema.json` record together with telemetry.

## Important

Do not let the cold agent read the context-package source from this parent repository. The prepared cold workspace intentionally excludes it.

