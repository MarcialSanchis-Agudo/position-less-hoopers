# PLH P1 — Candidate Matching

Status: experimental mechanism test.

P1 is the first causal mechanism in PLH.

It compares three assignment laws while keeping the candidate pool and Need fixed:

1. `static` — declared preference order,
2. `capability` — strongest feasible capability score,
3. `capability_situated` — capability plus current context/locality, continuity, and bounded cost/switch penalties.

## Frozen default matcher coefficients for the synthetic pilot

```text
capability     +1.00
situatedness   +0.35
continuity     +0.15
expected cost  -0.05
switch cost    -0.10
```

These coefficients are frozen for the P1 synthetic pilot before looking at comparative microbenchmark summaries.

They are **not** claimed to be optimal.

## Hard constraints precede scoring

A candidate is infeasible if it lacks any required:

- capability,
- tool,
- permission,

or is explicitly unavailable.

A high score may never override feasibility.

## Situatedness

For the current reference implementation, situatedness is the fraction of a Need's explicit `contextRefs` already present in the candidate's `contextRefs` or `artifactRefs`.

This is deliberately simple and inspectable.

No embeddings and no LLM scoring are used.

## Continuity

A candidate currently covering the same Need receives a small continuity reward.

This is the first precursor to the later basketball concept of avoiding unnecessary switches.

P1 itself does not implement switching.

## Synthetic microbenchmark

The P1 microbenchmark is a mechanism test only.

Each scenario specifies an independent `truth` model that assigns realized penalties for:

- missing context,
- switching/reloading,
- resource cost.

The matcher does not read those truth coefficients.

The purpose is to detect obviously pathological matcher behavior before expensive real-agent experiments.

Results from this synthetic microbenchmark must not be used as evidence that PLH improves real task performance.

## Next evidence level

After mechanism tests pass:

- integrate the three matching laws with ORCA or another real runner,
- use identical tasks/model pools/budgets,
- run held-out clean and CourtShift-perturbed tasks,
- record the ExperimentRun manifests,
- compare externally graded task success, recovery latency, and resource costs.

