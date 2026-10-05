# Warm context package

Relevant files:

- `src/commit.mjs`
- `src/state.mjs`

Key contract:

A proposal may commit only against the exact workspace version it observed. Missing versions are not equivalent to a match. Approval is necessary but not sufficient.

The bug is in the version-validity predicate.

