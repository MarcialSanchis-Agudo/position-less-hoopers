# Worker Context — agent-b / rollout contract v2

This is a bounded warm-context package for the contract-oriented worker.

Known public contract context for rollout contract v2, benchmark revision r2:

- API: `planRollout(nodes, options)`.
- All v1 requirements remain.
- Exclude nodes whose zone appears in `options.blockedZones`.
- If `options.canaryNodeId` names an eligible node, the first batch contains only that canary.
- After an eligible canary batch is created, each later batch may contain at most one node from the same zone.
- If no eligible canary batch is created, retain v1 batching semantics apart from blocked-zone filtering.
- Preserve deterministic input order when choosing the next feasible node.
- Every eligible non-blocked node appears exactly once.

The active file `contract/rollout.json` remains authoritative. This package is prior worker
context, not grader evidence and not permission to inspect hidden tests or grader source.
