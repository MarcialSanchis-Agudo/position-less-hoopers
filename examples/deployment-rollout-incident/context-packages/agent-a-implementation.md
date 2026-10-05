# Worker Context — agent-a / rollout implementation

This is a bounded warm-context package for the implementation-oriented worker.

Known public implementation context:

- The exported API is `planRollout(nodes, options)`.
- The implementation lives in `src/rollout.mjs`.
- The v1 implementation defaults `maxBatchSize` to 2.
- It filters out nodes whose `healthy` field is exactly `false`.
- It preserves eligible-node input order.
- It currently forms fixed-size slices of the eligible list and returns node IDs.
- The public test exercises v1 behavior only.

This package intentionally does **not** state any later contract semantics. The active file
`contract/rollout.json` remains authoritative for requirement changes. Use this package to
avoid reconstructing the implementation's structure and current behavior from scratch.
