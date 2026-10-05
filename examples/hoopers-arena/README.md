# Hoopers Arena — Last Possession 5v5

Hoopers Arena is PLH's controlled coordination mechanism study and visual demo.

It complements the real-agent CourtShift experiments.

## Scenario

Tie game. Twelve seconds remain.

Five offensive players begin against man coverage with functions such as:

- primary creation,
- ball screen,
- strong-side spacing,
- weak-side spacing,
- rim pressure.

With eight seconds left, the defense hard-traps the ball handler and rotates from the strong side.

The authoritative state changes.

PLH derives a new CoordinationTarget:

- ball security,
- release outlet,
- short-roll connector,
- weak-side lift,
- rim window.

The players retain capabilities. The functions are temporary and state-derived.

## Exact 5v5 oracle

Five agents cover five Needs.

The reference solver exhaustively evaluates all:

`5! = 120`

feasible assignments.

That allows exact oracle regret under the declared Hoopers Arena utility.

Current trap-state oracle:

- A → ball security
- B → release outlet
- C → short-roll connector
- D → weak-side lift
- E → rim window

The fixed-position and dynamic-predefined-role baselines instead map D to the outlet and B to the weak-side lift.

Current oracle regret in the strengthened v2 scenario:

- PLH: 0
- globally optimized dynamic predefined functions: 0
- fixed archetypes: ~0.667
- fixed positions: ~0.667

The strong B3 baseline searches the same 120 assignments as PLH but scores them through a fixed function ontology. In this particular trap state, that ontology is sufficient to recover the same assignment as PLH. The scenario therefore demonstrates the cost of rigid position/archetype ownership, but does **not** yet establish that emergent functions outperform strong dynamic predefined functions.

This is a controlled mechanism result, not a claim about real basketball optimality.

## Visual

The generated repo hero is:

`artifacts/figures/hoopers-arena-last-possession.svg`

It is generated from the same scenario and solver result used by the tests.

## Research role

Hoopers Arena tests:

- state-derived function emergence,
- exact assignment regret,
- target changes under perturbation,
- role-first vs need-first coordination.

CourtShift tests:

- real model executors,
- external correctness,
- real execution cost,
- perturbation recovery,
- cross-task portability.

