# Local Authoritative Evidence Loop v0.1

## Motivation

The one-shot Qwen 3.5 9B frontier run produced a clean stopping failure:

- 30/30 executor processes completed.
- 30/30 public `npm test` suites passed.
- 30/30 authoritative external grades failed.
- 30/30 final implementations were byte-for-byte identical to the actual pre-action implementation.

The next experiment therefore changes one system property only: an executor completion is not treated as Need satisfaction unless authoritative evidence agrees.

## Mechanism

Each cell receives at most three executor attempts.

```text
Need
  -> Responsibility
  -> executor attempt
  -> authoritative external grade
       -> satisfied: stop
       -> unsatisfied:
            freeze unsatisfied evidence obligations
            derive state requirements
            re-plan under the same baseline semantics
            execute again
```

Public test success is not a stopping condition.

## Feedback boundary

The external grader is never exposed to the executor.

After an unsuccessful grade, the system maps failed checks through the frozen file:

`benchmarks/courtshift/local-evidence-feedback-v0.1.json`

The executor receives only:

- stable unsatisfied-obligation identifiers;
- short semantic descriptions;
- derived capability requirements;
- derived context requirements.

It never receives:

- expected grader outputs;
- assertion diffs;
- grader source;
- hidden test source.

Unmapped grader checks abort rather than being interpreted after outcomes.

## Equal-budget baseline comparison

B0/B1/B2/B3/P all receive:

- the same Qwen 3.5 9B model;
- the same Ollama/Codex execution surface;
- the same maximum of three attempts;
- the same authoritative grader;
- the same feedback obligations.

They differ only through the frozen coordination semantics.

After feedback:

- B0 remains the broad generalist.
- B1 remains the fixed implementation owner.
- B2 selects a predefined specialist role and uses its fixed owner.
- B3 selects a predefined role and dynamically matches a worker.
- P derives a Need from the unsatisfied authoritative state requirements and allocates against the same specialist candidate pool as B3.

For v2 contract obligations, B3 and P both route to contract context.

For Artifact Lineage v3 provenance obligations, B3 remains constrained to a predefined role with zero context coverage and selects `worker-contract`, while P selects `worker-forensics`.

For Schema Bridge v3 external-schema obligations, B3 remains constrained to a predefined role with zero context coverage and selects `worker-conflict`, while P selects `worker-external-state`.

## Interpretation

This is exploratory development evidence, not publication evidence.

The primary question is not whether P wins. It is whether authoritative evidence-aware re-execution moves any small-model condition out of the false-completion regime, and whether the coordination policy changes the number of attempts or probability of reaching authoritative success under an equal budget.
