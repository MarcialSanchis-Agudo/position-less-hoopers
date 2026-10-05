# Results Draft

This file is a working results ledger. It separates development evidence from held-out evidence.

## Development evidence — not held out

Claude Sonnet 5.5, medium effort, fresh process/session per invocation.

### Checkout Incident — 5 replicates

- Greedy: 5/5 recovery, 5 invocations/run, 3 pre-perturbation invocations, mean agent execution 70.812 s.
- PLH Direct: 5/5 recovery, 1 invocation/run, 0 pre-perturbation invocations, mean agent execution 17.946 s, 60 s logical trigger delay.
- PLH Pressure: 5/5 recovery, 1 invocation/run, 0 pre-perturbation invocations, mean agent execution 16.972 s, 0 logical trigger delay.
- Static: 0/5 recovery.

### Config Migration Incident — 5 replicates

- Greedy: 5/5 recovery, 5 invocations/run, 3 pre-perturbation invocations, mean agent execution 70.308 s.
- PLH Direct: 5/5 recovery, 1 invocation/run, mean agent execution 17.080 s, 60 s logical trigger delay.
- PLH Pressure: 5/5 recovery, 1 invocation/run, mean agent execution 17.753 s, 0 logical trigger delay.
- Static: 0/5 recovery.

These development TaskPacks differ semantically but use matched event-stream shape. They support cross-task mechanism replication, not held-out generalization.

## Held-out evidence

### Deployment Rollout Incident r2 — 5 replicates

Created after `plh-v0.1-eval-freeze`. The event stream differs from development in event count, timing, and pressure trajectory.

| Policy | Success | Calls/run | Redundant calls/run | Mean agent time | Mean redundant time | Trigger latency |
|---|---:|---:|---:|---:|---:|---:|
| Static | 0/5 | 0 | 0 | 0 s | 0 s | — |
| Greedy | 5/5 | 6 | 5 | 85.766 s | 65.004 s | 0 s |
| PLH Direct | 5/5 | 1 | 0 | 20.414 s | 0 s | 80 s |
| PLH Pressure | 5/5 | 1 | 0 | 23.519 s | 0 s | 0 s |

For this held-out TaskPack/event stream/model configuration, PLH Pressure preserved 5/5 recovery while reducing agent invocations from 6 to 1 and mean agent execution time by approximately 72.6% relative to greedy coordination.

This is one held-out TaskPack with one executor family. It is not sufficient for a broad claim of general superiority.

## Post-hoc trigger diagnostics — not held out

These diagnostics were designed after inspecting the Deployment Rollout Incident r2 result. They are therefore mechanism/failure-boundary evidence, not additional held-out performance evidence.

### Direct-only challenge — 5 replicates

- Greedy: 5/5 recovery, 5 invocations/run, 0 s logical trigger delay, mean agent execution 74.117 s.
- PLH Direct: 5/5 recovery, 1 invocation/run, 0 s logical trigger delay, mean agent execution 21.601 s.
- PLH Pressure: 0/5 recovery, 0 invocations/run.
- Static: 0/5 recovery.

The direct-only challenge confirms the frozen pressure-only trigger can miss an explicit semantic failure when accumulated pressure remains below threshold.

### Delayed-pressure challenge — 5 replicates

- Greedy: 5/5 recovery, 7 invocations/run, 0 s logical trigger delay, mean agent execution 98.443 s.
- PLH Direct: 5/5 recovery, 1 invocation/run, 80 s logical trigger delay, mean agent execution 21.325 s.
- PLH Pressure: 5/5 recovery, 1 invocation/run, 50 s logical trigger delay, mean agent execution 20.074 s.
- Static: 0/5 recovery.

The delayed-pressure challenge confirms the expected trade-off: pressure-triggered coordination can remain sparse while reacting later than greedy when corroborating evidence arrives after the contract change.

The post-hoc candidate `plh_hybrid` implements `directTrigger OR pressureThresholdCrossing` without changing the frozen pressure thresholds. In real-agent diagnostics, it recovered 5/5 on the direct-only challenge with 1 invocation/run, 0 s logical trigger delay, and mean agent execution 22.479 s. On delayed-pressure it recovered 5/5 at 50 s logical trigger delay but made 2 invocations/run: the second was redundant after authoritative recovery, adding a mean 13.625 s of post-recovery execution.

A follow-on post-hoc candidate, `plh_hybrid_guarded`, keeps the same trigger decisions but adds an evidence-aware execution guard. Before executing a post-reveal trigger, it checks authoritative correctness and the expected evidence reference for the active target contract; if already satisfied, the trigger remains recorded while agent execution is suppressed. In the real-agent delayed-pressure diagnostic, it recovered 5/5 with 2 recomputation decisions/run but only 1 agent invocation/run, suppressed the later execution in all 5 runs, produced 0 post-recovery and 0 redundant invocations, preserved the 50 s logical recovery-trigger delay, and used mean agent execution 20.342 s.

In a subsequent post-hoc re-failure diagnostic, the same guarded policy recovered 5/5 after an initial v2 failure, suppressed the stale post-recovery direct trigger, then responded again after the workspace was deliberately regressed under the still-active v2 contract. Each run produced 3 recomputation decisions, 2 actual agent invocations, 1 suppressed execution, 2 genuine recovery attempts, and 0 redundant invocations. The first recovery remained at `corroborated-rollout-risk` with 50 s logical delay; the second real invocation occurred at `regression-confirmed`. Mean total agent execution was 42.820 s, of which 20.158 s was the genuine second recovery. This supports the mechanism-level distinction between reevaluation and execution without showing held-out generalization.

## Invalidated held-out run

`claude-sonnet-deployment-heldout-001` is excluded from all scientific analysis because benchmark revision r1 contained a contradiction between the public v1 compatibility test and the external v2 zone-diversity grader.

See:

`results/local/claude-sonnet-deployment-heldout-001/INVALIDATED.json`

