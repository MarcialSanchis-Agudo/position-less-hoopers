# PLH Publication Roadmap

## Objective

Produce one artifact that is simultaneously:

1. a credible open-source coordination framework,
2. a reusable experimental artifact,
3. the implementation behind a falsifiable systems/agents paper.

The GitHub project and paper must share semantics.

## Competitive GitHub criteria

A public release is not "competitive" because it has many files. It should make five things obvious within minutes:

### 1. Clear idea

A reader can answer:

- What problem does PLH solve?
- How is it different from role-first orchestration?
- What is implemented today?
- What is still a hypothesis?

### 2. Immediate reproducibility

A new user can:

```bash
npm test
npm run build:figures
```

without credentials or paid APIs.

Synthetic/dev figures regenerate from source.

### 3. Real examples

The repo should eventually contain:

- one minimal standalone PLH example,
- one ORCA integration example,
- one CourtShift scenario,
- one real-agent experiment recipe.

### 4. Inspectable evidence

Every reported number should map to:

```text
result
 → run manifest
 → event trace
 → config/code version
 → grader
 → artifacts
```

### 5. Maintainer-quality project surface

Before v0.1 public release:

- LICENSE
- CITATION.cff
- CONTRIBUTING.md
- SECURITY.md
- CI
- changelog/release notes
- issue templates
- stable schemas
- versioned benchmark scenarios
- documented compatibility policy

## Research maturity ladder

### R0 — deterministic mechanism tests

Current.

Purpose: make semantics precise.

### R1 — synthetic stress/mechanism experiments

Current.

Purpose: identify qualitative behavior and experimental quantities.

Do not use as real-agent performance evidence.

### R2 — real-agent development experiments

Next.

Purpose:

- measure real context-reload cost,
- validate instrumentation,
- estimate variance,
- bracket matcher coefficients.

Tasks used here are development tasks and cannot become held-out final evaluation tasks.

### R3 — frozen held-out comparison

Freeze before looking at outcomes:

- conditions,
- tasks,
- metrics,
- perturbations,
- coefficient/range,
- exclusion policy,
- grader.

Run B0/B1/B2/B3/P under matched resource constraints.

### R4 — artifact release

Publish:

- tagged code,
- scenario manifests,
- graders,
- run manifests,
- machine-readable results,
- figure-generation scripts,
- environment/version information.

### R5 — portability

Repeat the core coordination semantics on another execution substrate.

This is a secondary contribution, not a blocker for the first paper.

## Next three milestones

### M1 — real situatedness measurement

Warm vs cold context pairs on 5–10 development tasks.

Outputs:

- context-reload dataset,
- token/read/latency deltas,
- correctness comparison,
- variance estimate,
- coefficient/range decision.

### M2 — ORCA P1 integration

Run three assignment laws through the same ORCA workflow/harness:

- static preference,
- capability only,
- capability + situatedness.

No first-class Need yet.

Output:

- matched real-agent experiment,
- AssignmentDecision traces,
- cost/latency/correctness table.

### M3 — CourtShift recovery pilot

Use 3–5 development tasks and three perturbations:

- worker loss,
- external workspace mutation,
- hidden integration failure.

Output:

- recovery-event traces,
- recovery latency,
- uncovered-work intervals,
- clean→perturbed degradation.

## What not to do yet

Do not optimize for:

- star count,
- broad framework surface area,
- many adapters,
- UI polish ahead of experiment quality,
- a learned scheduler,
- final paper prose before real-agent evidence.

The strongest repository story is a small, inspectable system with unusually strong experimental discipline.

