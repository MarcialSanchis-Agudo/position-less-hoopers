# P1 Real Context-Reload Experiment

Status: next empirical step after synthetic P1 mechanism tests.

## Goal

Measure the real cost of losing situated context while holding the agent, task, tools, and grader fixed.

This experiment is designed to estimate the empirical quantity behind the P1 situatedness term.

## Paired conditions

Each task is run as a matched pair.

### Warm / situated

The agent receives a controlled context package immediately before the target task.

The package may contain:

- the relevant files already read,
- concise state summary,
- relevant artifact references,
- the active hypothesis/constraint set.

### Cold / unsituated

The same model starts without that task-specific context package.

It receives the same repository, tools, permissions, task instruction, and budget and may reconstruct context normally.

## Match exactly

Within each pair keep fixed:

- task/version,
- model/provider/model settings,
- tool permissions,
- repository/workspace state,
- task prompt after the warm-up stage,
- grader,
- max budget,
- concurrency.

Order should be randomized or counterbalanced across tasks to reduce temporal/provider drift.

## Record

Each run must record:

- input tokens,
- output tokens,
- tool calls,
- file reads,
- repeated file reads,
- time to first useful action,
- total duration,
- stale-state actions,
- external correctness,
- model identifier,
- context-package hash.

Use `schemas/context-reload-run.schema.json`.

## Primary development measurements

The primary purpose is calibration, not a final paper win/loss.

Report cold minus warm for:

1. total tokens,
2. time to first useful action,
3. total duration,
4. file reads,
5. repeated file reads.

Also report paired correctness.

## What counts as first useful action?

Define it before collecting runs.

For coding tasks, recommended definition:

> the timestamp of the first persisted edit/patch that touches a grader-relevant target or the first evidence-producing command that materially advances the target task.

Do not use an LLM judge to decide this if a deterministic event can identify it.

## Development protocol

Start with 5–10 cheap tasks.

For each task:

- one warm run,
- one cold run,
- same model.

Repeat a subset to estimate variance.

Do not use final held-out CourtShift tasks.

## Decision after development runs

Do not convert token/latency overhead directly into a situatedness coefficient automatically.

Instead use the results to:

- determine whether context-loss cost is negligible, moderate, or large,
- bracket a predeclared situatedness-weight range,
- decide whether the P1 real-agent evaluation should use one fixed coefficient or a sensitivity band.

Freeze that choice before held-out comparative evaluation.

## Link to the current synthetic result

The current synthetic team simulation crosses from capability-only to capability+situatedness at a context penalty of roughly 0.159 in its arbitrary utility scale.

The real experiment is intended to replace that arbitrary penalty with observed operational costs and correctness effects.

