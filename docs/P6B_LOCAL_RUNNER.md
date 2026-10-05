# P6b — Local Runner Adapter

The local runner is the first concrete RunnerPort adapter.

It executes a command inside the workspace scoped by an `ExecutionRequest`, captures process telemetry, and requires a deterministic parser to produce a valid `ExecutionResult`.

The adapter records:

- started/finished timestamps,
- duration,
- exit code,
- signal,
- stdout/stderr,
- timeout state.

The runner does not decide Need satisfaction.

It may return evidence refs only through the result parser, and PLH still validates those refs against the Need.

## Role in experiments

The local adapter serves three purposes:

1. validate the RunnerPort contract without a model,
2. provide deterministic graders/oracles,
3. establish the telemetry envelope that model adapters should implement.

Model-specific adapters should preserve the same request/result contract.

