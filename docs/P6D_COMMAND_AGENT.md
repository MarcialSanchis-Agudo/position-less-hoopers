# P6d — Command Agent Adapter

The command adapter is the bridge between PLH's provider-neutral RunnerPort and arbitrary local/CLI agents.

It deliberately does **not** require the agent to print machine-readable JSON to stdout.

For each run PLH writes:

- `execution-request.json`
- `agent-instructions.md`

and provides environment variables:

- `PLH_EXECUTION_REQUEST`
- `PLH_EXECUTION_RESULT`
- `PLH_WORKSPACE`
- `PLH_RUN_ROOT`

The external command may edit the workspace normally.

Before exiting it must write:

`execution-result.json`

valid against the PLH ExecutionResult contract.

PLH captures stdout/stderr/process timing separately.

## Why a file protocol?

Coding-agent CLIs often mix:

- progress output,
- tool traces,
- prose,
- warnings,

on stdout/stderr.

A separate result file makes the protocol deterministic and provider-neutral.

## Provider wrapper pattern

A future wrapper can translate:

```text
ExecutionRequest
      ↓
provider-specific prompt/session invocation
      ↓
workspace edits
      ↓
provider-specific telemetry
      ↓
ExecutionResult
```

without changing Need/Responsibility semantics.

