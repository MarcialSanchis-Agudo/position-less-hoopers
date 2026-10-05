# Claude Code Adapter

This adapter runs Claude Code non-interactively through the provider-neutral PLH CommandAgent protocol.

## Session isolation

Each invocation uses:

`claude -p`

without `--continue` or `--resume`, so each experiment cell starts a fresh Claude Code session.

The benchmark prompt explicitly forbids parent/sibling access, reference solutions, previous experiment runs, grader source, hidden tests, and mutation of task contracts/tests.

## Tool boundary

The wrapper requests only:

- Read
- Edit
- Write
- Glob
- Grep
- `Bash(npm test)`

No external grader is exposed to Claude.

## Evidence

Claude's ExecutionResult contains no authoritative evidence refs.

After the wrapper finishes, PLH's experiment cell runs the external TaskPack grader outside the agent workspace.

Only that grader can populate `authoritativeEvidenceRefs`.

## Local use

Prepare one cell:

```bash
npm run task:prepare -- \
  examples/checkout-incident/task-pack.json \
  results/local/claude-run \
  plh_direct
```

Then run:

```bash
npm run cell:run -- \
  results/local/claude-run/checkout-clean-v2/plh_direct \
  examples/adapters/claude-code.json
```

For the clean four-policy matrix:

```bash
npm run matrix:clean -- \
  examples/checkout-incident/task-pack.json \
  results/local/claude-checkout-clean \
  examples/adapters/claude-code.json
```

Each matrix cell launches a fresh Claude Code process/session.

## Development note

The wrapper supports a `CLAUDE_BIN` environment override so CI can validate the protocol with a fake CLI without making provider calls.

