# Warm context package

Relevant files:

- `src/router.mjs`
- `src/policies.mjs`

Key contract:

1. Exact capability matches take precedence.
2. Fallback candidates are considered only when no exact candidate is available.
3. Disabled candidates are never eligible.

The current failure is in how the route selector combines exact and fallback candidates. The context package intentionally does not provide the patch.

