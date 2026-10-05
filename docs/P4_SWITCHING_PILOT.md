# P4 Switching Pilot

This synthetic mechanism test compares three policies on one identical candidate-state trace.

## Scenario

A single implementation Need starts assigned to agent A.

The trace contains:

1. normal operation,
2. a small score improvement for B,
3. a small score reversal back toward A,
4. worker loss for A,
5. a stable recovery candidate.

## Conditions

### no_switch

Never changes assignee.

Expected behavior:

- zero churn,
- failure to recover from worker loss.

### greedy_switch

At every observation, switch to the currently highest-ranked operational candidate.

Expected behavior:

- recovers from worker loss,
- may switch during small score oscillations,
- higher churn/context reload risk.

### plh_hysteresis

Use the P4 switch rule:

- normal changes require margin + tenure + cooldown,
- operational failure forces switching when an alternative exists.

Expected behavior:

- suppress small oscillation switches,
- recover immediately from worker loss,
- preserve Need identity.

## Metrics

- switch count,
- unnecessary switch count,
- uncovered time after worker loss,
- context reload events,
- final operational assignee.

## Claim discipline

This pilot demonstrates mechanism behavior only.

It does not establish that PLH improves real-agent recovery latency or task success.

The real CourtShift version should inject worker loss into running agent tasks and measure externally graded recovery.

