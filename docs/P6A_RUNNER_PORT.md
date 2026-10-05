# P6a — Provider-Neutral RunnerPort

P6a separates PLH coordination semantics from the model/execution provider.

PLH emits an `ExecutionRequest` containing:

- authoritative region/Goal/state identity,
- admitted Need,
- temporary Responsibility,
- bounded authority,
- workspace reference,
- task instruction,
- optional context-package references,
- expected evidence.

A runner returns an `ExecutionResult`.

The result is translated back into one of:

- evidence-bearing Responsibility completion,
- governed Help signal,
- failure signal.

## Why this matters

The same PLH coordination law should be testable with:

- a local scripted runner,
- Codex,
- Claude Code,
- Gemini/other coding agents,
- ORCA runners,
- Google AX.

Provider/model identity belongs in experiment metadata and the runner adapter, not in the Need/Responsibility semantics.

## Safety boundary

The executor does not decide that a Need is satisfied.

It may return evidence refs.

PLH/harness code still decides whether those refs satisfy the admitted Need's evidence obligations.

Likewise, a blocked executor can propose help, but the returned Help signal still passes through deterministic Need admission.

