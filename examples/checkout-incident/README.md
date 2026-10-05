# Checkout Incident

This is the main PLH vertical-slice example.

It combines:

- Need admission,
- team-aware Need selection,
- situated candidate assignment,
- emergent Help Needs,
- worker-loss switching,
- evidence-gated completion,
- AdaptiveRegion exit,
- optional sandpile-inspired pressure triggers.

## Story

A checkout payment callback must be implemented and externally verified.

Agent A begins implementation.

An undocumented callback contract creates uncertainty and a verification gap. The pressure-trigger variant can accumulate those two sub-threshold signals and emit a group trigger, causing the system to create/allocate support work without a central polling planner.

Agent B grounds the callback contract.

Later Agent A is lost.

P4 forces the same Need onto Agent B.

The region exits only after integration evidence is recorded and every admitted Need is terminal.

## Why this example?

It exercises nearly every PLH mechanism while staying small enough to understand from one trace.

It is intended as:

- GitHub demo,
- integration fixture,
- precursor to a real CourtShift benchmark.

## Real v0 harness

The example now includes:

- `seed/` — intentionally incomplete real workspace,
- `contracts/v1..v3.json` — evolving external contract,
- `grader/grade.mjs` — external grader with hidden cases,
- `scenarios/` — clean v2, hidden contract, external mutation, worker loss,
- `reference-solution/` — known oracle used only to verify solvability,
- `experiment-plan.json` — static / greedy / PLH direct / PLH pressure matrix.

The seed passes v1 but intentionally fails v2/v3.

The reference solution passes v2 and v3, proving the benchmark is solvable.

This is still a development benchmark until real-agent runs are collected under matched resource constraints.

