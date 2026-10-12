# Local Capability Frontier v0.1

This is an exploratory development track, separate from the frozen hosted-model paper runs.

## Core question

Can Need-first coordination increase the fraction of a small model's existing capability that is effectively deployable by aligning bounded responsibility and context with the current state?

The first condition uses exactly one model everywhere:

`qwen3.5:4b`

Every worker identity is therefore the same underlying weights and local provider. Only the coordination semantics, Responsibility, and bounded context differ.

## Why this matters

A small model may fail a broad software task while still being competent at narrower functions such as contract interpretation, implementation repair, provenance diagnosis, or verification. PLH should be credited only if it makes those existing narrow capabilities more usable; it must not be described as creating intelligence the model does not possess.

## First study

Reuse the two ontology-stress TaskPacks and B0/B1/B2/B3/P ladder.

Run one 30-cell smoke matrix first. If the model cannot use tools or every condition fails, stop and diagnose the capability boundary. If outcomes vary, run three repeats (90 cells).

Suggested model ladder after the 4B point:

1. `qwen3.5:4b`
2. `qwen3.5:9b`
3. optional `gpt-oss:20b` if the machine has enough memory/headroom.

Do not pool results across model tags or hosted providers.
