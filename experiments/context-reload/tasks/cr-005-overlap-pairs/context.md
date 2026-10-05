# Warm context package

Relevant files:

- `src/overlap.mjs`

Key contract:

Overlap is undirected and each pair must be emitted once. Only active work participates. A pair is emitted when normalized write sets intersect. Output order must be deterministic by left ID then right ID.

The current implementation double-emits symmetric pairs.

