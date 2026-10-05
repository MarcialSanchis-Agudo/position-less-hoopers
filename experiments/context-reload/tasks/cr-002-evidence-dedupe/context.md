# Warm context package

Relevant files:

- `src/evidence.mjs`
- `test/evidence.test.mjs`

Key contract:

Evidence references are deduplicated by `ref`, preserving the first-seen order. If the same ref appears again with a stronger confidence value, the original position stays but the stored confidence must be upgraded.

The current implementation loses one of those two properties.

