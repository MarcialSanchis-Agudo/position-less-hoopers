# CourtShift

CourtShift is a perturbation protocol for evaluating whether an agent coordination system adapts when the work state changes during execution.

It begins as a format/protocol inside PLH. It should not be called a standalone benchmark until a non-PLH runner can consume the format.

## Design principles

1. **External correctness** — task success is graded outside the coordinator.
2. **Deterministic perturbation** — the same perturbation can be replayed.
3. **Coordination relevance** — perturbations create a reason to reconfigure work.
4. **Matched conditions** — all coordination conditions receive equivalent perturbations.
5. **No privileged signal** — PLH may not receive hidden information unavailable to baselines.
6. **Clean twin** — every perturbed scenario has an unperturbed counterpart.
7. **Machine-readable manifest** — task, perturbation, timing, grader, and results are versioned.

## Initial perturbation taxonomy

- worker loss
- provider/candidate unavailability
- external workspace mutation
- conflicting concurrent mutation
- hidden integration failure
- requirement shift
- assumption invalidation
- late independent refute
- stale context

## Scenario contract

A future versioned scenario should minimally contain:

```json
{
  "schemaVersion": 1,
  "scenarioId": "example",
  "taskRef": "task-id-or-manifest",
  "cleanTwinId": "example-clean",
  "injection": {
    "type": "worker_loss",
    "trigger": {
      "kind": "semantic_event",
      "event": "first_patch_emitted"
    }
  },
  "recovery": {
    "criterion": "externally_observable"
  },
  "graderRef": "grader-version"
}
```

Prefer semantic injection points over wall-clock sleeps.

## Pilot

The initial development pilot should use:

- 3–5 cheap tasks,
- worker loss,
- external workspace mutation,
- hidden integration failure.

Success criteria for the pilot are instrumentation criteria:

- deterministic/reliable injection,
- complete run manifests,
- deterministic grader,
- auditable recovery event,
- trustworthy timing/cost data.

The pilot is not used for final effect-size claims.

## Promotion to standalone benchmark

Do not market CourtShift as a reusable benchmark until:

- scenario format is documented independently of PLH internals,
- at least one non-PLH runner consumes it,
- graders and task licenses permit public release,
- scenarios have stable versions,
- reference adapters exist.

