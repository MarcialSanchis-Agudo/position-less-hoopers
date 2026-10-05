# P5b Trigger Threshold Sensitivity

The pressure threshold is a policy parameter, not a universal constant.

A low threshold may:

- trigger useful help early,
- increase recomputations,
- increase false positives.

A high threshold may:

- suppress noise,
- delay useful intervention,
- miss support entirely.

The reference sensitivity sweep varies node and group thresholds independently.

Primary development quantities:

- coordination recomputations,
- unnecessary recomputations,
- false-positive help count,
- missed support count,
- mean support-trigger latency.

This is intentionally a development/sensitivity analysis. Thresholds should not be tuned on held-out evaluation scenarios.

