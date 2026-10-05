import { runLastPossessionMechanismTest } from "./hoopers-arena.mjs";

export function evaluateHoopersArenaSuite(base, suite) {
  const rows = [];

  for (const shift of suite.shifts ?? []) {
    const state = shift.sourceState
      ? structuredClone(base[shift.sourceState])
      : structuredClone(shift.state);

    if (!state) {
      throw new TypeError(`Missing state for shift ${shift.id}`);
    }

    const agents = base.agents.map((agent) => ({
      ...structuredClone(agent),
      location:
        shift.agentLocations?.[agent.id] ??
        structuredClone(agent.location)
    }));

    const scenario = {
      ...structuredClone(base),
      scenarioId: `${base.scenarioId}:${shift.id}`,
      agents,
      trapState: state
    };

    const result = runLastPossessionMechanismTest(scenario);

    rows.push({
      shiftId: shift.id,
      stateMode: result.stateMode,
      plhRegret: result.shift.plh.oracleRegret,
      fixedPositionRegret:
        result.shift.fixedPosition.oracleRegret,
      fixedArchetypeRegret:
        result.shift.fixedArchetype.oracleRegret,
      dynamicPredefinedRegret:
        result.shift.dynamicPredefinedRoles.oracleRegret,
      dynamicCandidatesEvaluated:
        result.shift.dynamicPredefinedRoles.candidatesEvaluated,
      oracleAssignment: result.shift.plh.assignment,
      dynamicPredefinedAssignment:
        result.shift.dynamicPredefinedRoles.assignment
    });
  }

  const mean = (values) =>
    values.reduce((sum, value) => sum + value, 0) /
    Math.max(1, values.length);

  return {
    schemaVersion: 1,
    suiteId: suite.suiteId,
    baseScenario: suite.baseScenario,
    designIntent: suite.frozenDesignIntent,
    shiftCount: rows.length,
    byPolicy: {
      plh: {
        meanOracleRegret: mean(rows.map((r) => r.plhRegret))
      },
      fixedPosition: {
        meanOracleRegret: mean(
          rows.map((r) => r.fixedPositionRegret)
        )
      },
      fixedArchetype: {
        meanOracleRegret: mean(
          rows.map((r) => r.fixedArchetypeRegret)
        )
      },
      dynamicPredefinedFunctions: {
        meanOracleRegret: mean(
          rows.map((r) => r.dynamicPredefinedRegret)
        ),
        exactAssignmentMatches: rows.filter(
          (r) => r.dynamicPredefinedRegret === 0
        ).length
      }
    },
    rows
  };
}

