# Warm context package

Relevant files:

- `src/budget.mjs`

Key contract:

Admission must account for already reserved budget. A request is admissible only when:

`spent + reserved + requested <= limit`

Zero-cost requests are valid. Negative amounts are invalid input.

The current check omits one state component.

