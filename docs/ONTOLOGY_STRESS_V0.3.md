# Ontology Stress v0.3 — Pre-Task Freeze

This file records the chronology required for the next experiment.

The v0.2 prospective matrix showed that B3 and P chose the same worker in every cell. The predefined role ontology therefore fully covered that task population.

For v0.3, the predefined B3 ontology and the worker pool are frozen **before** the ontology-stress TaskPacks are authored.

Machine-readable freeze:

`benchmarks/courtshift/ontology-stress-baselines-v0.3.json`

## Frozen B3 ontology

B3 may dynamically reassign workers, but every responsibility must be expressed as one of seven predefined functions:

- implementer;
- contract interpreter;
- verifier;
- runtime investigator;
- dependency diagnostician;
- recovery planner;
- conflict resolver.

This is intentionally a strong ontology rather than a straw baseline.

## Frozen worker pool

The candidate pool is larger than the role vocabulary. In addition to workers aligned to the seven roles, it contains:

- a provenance/audit-log worker;
- an external-signal/schema-history worker.

B3 is not forbidden from selecting these workers. It simply does not have a dedicated predefined function whose context definition names those dimensions.

P uses the same worker pool and matcher, but its Need may be derived from the authoritative state and therefore may reference context dimensions not present in the frozen B3 ontology.

## Chronology rule

The commit containing this document and ontology file must precede any commit that adds the v0.3 ontology-stress TaskPacks. That gives the paper an auditable pre-task ontology freeze.
