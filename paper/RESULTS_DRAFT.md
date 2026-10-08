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

### ORCA AX assignment-shift vertical slice — 1 real-agent run

A frozen post-hoc mechanism test composed guarded wake-up, Need admission, P3b allocation, P1 capability+situatedness matching, leased Responsibility, RunnerPort execution, and authoritative evidence-gated Need satisfaction. The real Claude run matched the frozen assignment prediction exactly: `agent-b → agent-a`.

- First recovery Need at `corroborated-rollout-risk`: `agent-b` was selected despite lower implementation capability (0.82 vs 0.95) because it had the required contract context, yielding matcher score 1.17 vs 0.95.
- The stale `explicit-rollout-blocked` trigger was reevaluated but suppressed because authoritative v2 evidence was already satisfied.
- After the workspace regression, the new Need at `regression-confirmed` shifted to `agent-a`, which now had the relevant implementation context and scored 1.30 vs 0.82.
- Both Needs were satisfied by authoritative v2 evidence; both executions completed successfully in 21.527 s and 21.012 s respectively; final external grading passed all 6 checks.

This establishes end-to-end composition and state-responsive Responsibility assignment in the current ORCA AX slice. It does not establish a real-agent situatedness performance advantage because both candidate identities are executed by the same Claude adapter/model; the assignment identities are coordination entities rather than independently instantiated model workers.

### ORCA AX real-context routing pilot — 5 matched replicates per policy

A follow-on frozen post-hoc pilot gave the two worker identities different bounded warm-context packages while keeping the same Claude Sonnet 5.5 model, medium effort, fresh session per execution, TaskPack, event stream, and guarded trigger policy. Capability-only routing selected `agent-a → agent-a` in all five runs, producing one context-misaligned first assignment per run. Capability+situatedness selected `agent-b → agent-a` in all five runs, producing zero context-misaligned assignments. Both conditions achieved 5/5 final correctness and authoritative evidence satisfaction.

For the first recovery—the episode where the routing decisions differed—capability-only mean agent execution was 19.773 s and capability+situatedness was 18.183 s, a paired mean reduction of 1.590 s (about 8.0%). The situated condition was faster in 4/5 matched pairs. A paired t-based 95% interval for the capability-minus-situated difference is approximately +0.046 s to +3.134 s; with only five pairs this should be treated as a positive pilot signal, not stable population-level evidence.

Mean total agent execution was 39.810 s for capability-only and 38.188 s for capability+situatedness, a mean reduction of 1.622 s (about 4.1%), but this aggregate was noisier: situated routing was faster in only 3/5 total-time pairs and the paired 95% interval includes zero. The second recovery, where both policies selected `agent-a`, was effectively tied on average (20.037 s capability-only vs 20.005 s situated).

This supports a narrow mechanism claim: on this one post-hoc TaskPack/model pilot, routing the first Need to the worker with matching prior context reduced mean real-agent execution time while preserving correctness. It does not establish general situatedness superiority across tasks, models, providers, or context regimes.


## Prospective publication evaluation v0.2 — 200 real-agent cells

Frozen before any Access Policy Incident or Event Replay Incident Claude outcomes were inspected. The matrix used Claude Sonnet 5.5, medium effort, five replicates, two prospective TaskPacks, four scenario classes, and five frozen coordination baselines (B0/B1/B2/B3/P), for 200 analyzable cells and zero infrastructure failures.

All five baselines achieved 40/40 externally verified success. The prospective primary success endpoint therefore saturated and does not support a PLH success-rate advantage.

Perturbed mean recovery latency was:

- B0 strong single agent: 22.733 s;
- B1 static workflow: 22.711 s;
- B2 fixed specialist team: 22.878 s;
- B3 dynamic predefined roles: 22.291 s;
- P / PLH-ORCA AX: 21.355 s.

P had the lowest aggregate perturbed mean, 0.936 s lower than B3, but the paired B3-minus-P recovery difference across 30 perturbed task/scenario/replicate pairs was noisy and crossed zero under paired resampling. P was faster in 17/30 pairs and B3 in 13/30.

Most importantly, B3 and P selected the same worker identity in every prospective cell. The frozen implementer/contract-specialist ontology was sufficient to express every state in this task set. Therefore this matrix does not demonstrate an advantage for state-derived Need emergence over strong dynamic predefined-role assignment. The B3↔P timing differences should be treated as execution/prompt variation under matched routing, not as evidence for emergent-function superiority.

A narrower routing signal remains: under external contract mutation, state-responsive contract-specialist routing was faster than the static implementation-owner condition. This supports continued study of situated specialization, while leaving the stronger Need-first-vs-predefined-role claim unresolved.

This v0.2 result is retained as a prospective null/ceiling result and will not be tuned or rerun until it favors PLH.

## Infrastructure-invalid v0.3 ontology-stress attempt

The first real-agent v0.3 ontology-stress matrix is excluded from performance and success-rate claims because executor behavior collapsed after 60 successful cells: all remaining 90 scheduled cells returned failed Claude invocations with approximately 2–4 s durations. An inspected failure had Claude exit code 1, no signal, empty stderr, and public tests exit code 0. The routing traces remain useful mechanism evidence: all 10 stress pairs had zero B3 role-context coverage and B3/P selected different workers. v0.3.1 preserves the scientific design and changes only infrastructure accounting, fail-fast behavior, and checkpointed resume.

## Invalidated held-out run

`claude-sonnet-deployment-heldout-001` is excluded from all scientific analysis because benchmark revision r1 contained a contradiction between the public v1 compatibility test and the external v2 zone-diversity grader.

See:

`results/local/claude-sonnet-deployment-heldout-001/INVALIDATED.json`
