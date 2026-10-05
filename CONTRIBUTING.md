# Contributing

PLH is developed as both an open-source coordination framework and a reproducible research artifact.

## Development

Requires Node.js 20+.

```bash
npm test
npm run build:figures
```

All deterministic tests should pass before a change is proposed.

## Research integrity

Changes to frozen definitions after comparative experiments begin must be documented.

Examples:

- primary metrics,
- baseline definitions,
- perturbation semantics,
- matcher coefficients,
- exclusion rules,
- grader versions.

Synthetic results must remain explicitly labeled synthetic.

## Pull request expectations

Explain:

1. what coordination/research question the change addresses,
2. which invariants it changes or preserves,
3. which tests were added/changed,
4. whether it changes a frozen research definition,
5. which artifacts/figures need regeneration.

