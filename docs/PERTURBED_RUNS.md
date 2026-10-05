# Perturbed TaskPack Runs

PLH's real benchmark harness now supports two-phase perturbation runs for TaskPacks.

## Supported real two-phase perturbations

- contract reveal,
- external contract mutation.

The execution sequence is:

```text
initial contract
      ↓
phase-1 executor
      ↓
initial external grader must pass
      ↓
inject perturbation
      ↓
target external grader must fail
      ↓
policy decides whether recovery is allowed
      ↓
phase-2 executor
      ↓
target external grader
```

A perturbed run is considered discriminating only when the target contract fails immediately after the perturbation.

If it already passes, the run is excluded because no adaptation was required.

## Static baseline

The current static policy deliberately does not perform phase-2 recovery.

Its post-perturbation failure is recorded as an experimental outcome, not a harness error.

## Greedy / PLH conditions

The current development runner allows a recovery execution for:

- greedy,
- plh_direct,
- plh_pressure.

This validates the experiment plumbing but does not yet distinguish their internal recovery decisions when using the deterministic reference adapter.

Real-agent adapters are required before these policy conditions become comparative evidence.

## Worker loss

Worker loss is not yet a real perturbed run.

The current CommandAgent adapter is atomic and cannot terminate an executor during a live Responsibility.

Accordingly, worker-loss rows are emitted as:

`unsupported_live_interrupt`

and:

`eligibleForScientificAnalysis = false`

A future live-session adapter must support:

1. a running Responsibility,
2. deterministic interruption,
3. detection of coverage loss,
4. replacement assignment,
5. recovery timing from interruption to useful resumed work.

Only then should worker-loss recovery latency enter the paper's real-agent results.

## Current metrics

The perturbed matrix records:

- initial correctness,
- post-perturbation correctness,
- whether recovery executed,
- final correctness,
- evidence satisfaction,
- recovery completion latency,
- explicit exclusion reason.

