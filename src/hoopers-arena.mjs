import { createCoordinationTarget } from "./coordination-target.mjs";

function distance(a, b) {
  return Math.hypot(
    (a.x ?? 0) - (b.x ?? 0),
    (a.y ?? 0) - (b.y ?? 0)
  );
}

function permutations(items) {
  if (items.length <= 1) return [items.slice()];
  const out = [];
  for (let i = 0; i < items.length; i += 1) {
    const head = items[i];
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of permutations(rest)) {
      out.push([head, ...tail]);
    }
  }
  return out;
}

function capabilityFit(agent, need) {
  return Object.entries(need.capabilityWeights ?? {}).reduce(
    (sum, [capability, weight]) =>
      sum + weight * (agent.capabilities?.[capability] ?? 0),
    0
  );
}

function locality(agent, need) {
  return 1 / (1 + distance(agent.location, need.target));
}

export function deriveBasketballNeeds(state) {
  if (!state?.live || state.possession !== "offense") return [];

  if (
    state.defense?.mode === "trap" &&
    state.defense?.trappedBallHandler
  ) {
    return [
      {
        id: "ball_security",
        objective: "Protect the ball and deliver the first pass out of the trap",
        importance: 1,
        critical: true,
        target: { x: 5.0, y: 7.4 },
        capabilityWeights: {
          handle: 0.50,
          pass: 0.25,
          decision: 0.25
        }
      },
      {
        id: "release_outlet",
        objective: "Flash into a safe passing window outside the trap",
        importance: 1,
        critical: true,
        target: { x: 2.7, y: 6.0 },
        capabilityWeights: {
          handle: 0.15,
          pass: 0.45,
          shoot: 0.15,
          decision: 0.25
        }
      },
      {
        id: "short_roll_connector",
        objective: "Occupy the middle and connect the 4-on-3 advantage",
        importance: 0.98,
        critical: true,
        target: { x: 5.1, y: 4.2 },
        capabilityWeights: {
          screen: 0.18,
          pass: 0.40,
          decision: 0.32,
          finish: 0.10
        }
      },
      {
        id: "weak_side_lift",
        objective: "Lift behind the rotating weak-side defender for a kickout",
        importance: 0.88,
        critical: false,
        target: { x: 8.2, y: 4.8 },
        capabilityWeights: {
          shoot: 0.62,
          cut: 0.18,
          decision: 0.20
        }
      },
      {
        id: "rim_window",
        objective: "Occupy the dunker/rim window created by the rotation",
        importance: 0.90,
        critical: false,
        target: { x: 3.8, y: 1.7 },
        capabilityWeights: {
          finish: 0.55,
          cut: 0.25,
          screen: 0.10,
          decision: 0.10
        }
      }
    ];
  }

  if (state.defense?.mode === "switch") {
    return [
      {
        id: "mismatch_attack",
        objective: "Exploit the switched matchup before the defense can reset",
        importance: 1,
        critical: true,
        target: { x: 5.4, y: 6.8 },
        capabilityWeights: {
          handle: 0.38,
          finish: 0.28,
          pass: 0.14,
          decision: 0.20
        }
      },
      {
        id: "ghost_rescreen",
        objective: "Re-screen or ghost to prevent the switched defender from settling",
        importance: 0.91,
        critical: true,
        target: { x: 5.0, y: 5.5 },
        capabilityWeights: {
          screen: 0.40,
          shoot: 0.20,
          pass: 0.18,
          decision: 0.22
        }
      },
      {
        id: "strong_corner_hold",
        objective: "Hold the strong corner and punish stunt help",
        importance: 0.82,
        critical: false,
        target: { x: 1.5, y: 1.5 },
        capabilityWeights: {
          shoot: 0.72,
          decision: 0.18,
          cut: 0.10
        }
      },
      {
        id: "weak_side_exchange",
        objective: "Exchange on the weak side to distort the help shell",
        importance: 0.86,
        critical: false,
        target: { x: 8.0, y: 4.2 },
        capabilityWeights: {
          shoot: 0.40,
          cut: 0.34,
          pass: 0.10,
          decision: 0.16
        }
      },
      {
        id: "seal_window",
        objective: "Seal the smaller switched defender near the rim",
        importance: 0.92,
        critical: false,
        target: { x: 4.1, y: 1.6 },
        capabilityWeights: {
          finish: 0.48,
          screen: 0.20,
          rebound: 0.18,
          decision: 0.14
        }
      }
    ];
  }

  if (state.defense?.mode === "paint_collapse") {
    return [
      {
        id: "ball_reversal",
        objective: "Reverse the ball before the collapsed shell can recover",
        importance: 0.96,
        critical: true,
        target: { x: 2.6, y: 6.1 },
        capabilityWeights: {
          pass: 0.46,
          handle: 0.18,
          decision: 0.28,
          shoot: 0.08
        }
      },
      {
        id: "nail_connector",
        objective: "Occupy the nail as a catch-and-decide connector",
        importance: 1,
        critical: true,
        target: { x: 5.0, y: 4.7 },
        capabilityWeights: {
          pass: 0.40,
          decision: 0.34,
          shoot: 0.16,
          finish: 0.10
        }
      },
      {
        id: "weak_side_skip",
        objective: "Present a weak-side skip target behind the collapsed defense",
        importance: 0.90,
        critical: true,
        target: { x: 8.4, y: 5.3 },
        capabilityWeights: {
          shoot: 0.54,
          pass: 0.20,
          decision: 0.18,
          cut: 0.08
        }
      },
      {
        id: "baseline_drift",
        objective: "Drift along the baseline behind the low help defender",
        importance: 0.84,
        critical: false,
        target: { x: 8.3, y: 1.5 },
        capabilityWeights: {
          shoot: 0.50,
          cut: 0.32,
          decision: 0.18
        }
      },
      {
        id: "crash_balance",
        objective: "Occupy the rebound/rim window without destroying transition balance",
        importance: 0.86,
        critical: false,
        target: { x: 3.5, y: 1.5 },
        capabilityWeights: {
          rebound: 0.42,
          finish: 0.30,
          decision: 0.18,
          screen: 0.10
        }
      }
    ];
  }

  if (state.defense?.mode === "zone_23") {
    return [
      {
        id: "top_reversal",
        objective: "Move the top line of the zone before it can load to the ball",
        importance: 0.95,
        critical: true,
        target: { x: 3.0, y: 6.7 },
        capabilityWeights: {
          pass: 0.42,
          handle: 0.22,
          decision: 0.28,
          shoot: 0.08
        }
      },
      {
        id: "high_post_flash",
        objective: "Flash into the high post and become a catch-and-decide hub",
        importance: 1,
        critical: true,
        target: { x: 5.0, y: 4.6 },
        capabilityWeights: {
          pass: 0.40,
          decision: 0.34,
          finish: 0.14,
          shoot: 0.12
        }
      },
      {
        id: "short_corner_occupancy",
        objective: "Occupy the short corner behind the low zone defender",
        importance: 0.90,
        critical: false,
        target: { x: 2.0, y: 1.8 },
        capabilityWeights: {
          finish: 0.40,
          cut: 0.28,
          pass: 0.16,
          decision: 0.16
        }
      },
      {
        id: "zone_skip_window",
        objective: "Hold the opposite skip window to punish long zone rotations",
        importance: 0.90,
        critical: true,
        target: { x: 8.4, y: 5.4 },
        capabilityWeights: {
          shoot: 0.58,
          pass: 0.18,
          decision: 0.18,
          cut: 0.06
        }
      },
      {
        id: "zone_glass_balance",
        objective: "Threaten the weak-side glass while preserving transition balance",
        importance: 0.82,
        critical: false,
        target: { x: 7.0, y: 2.0 },
        capabilityWeights: {
          rebound: 0.42,
          finish: 0.24,
          decision: 0.20,
          cut: 0.14
        }
      }
    ];
  }

  if (state.defense?.mode === "drop") {
    return [
      {
        id: "pocket_pullup",
        objective: "Punish the drop with a controlled pocket pull-up or paint touch",
        importance: 1,
        critical: true,
        target: { x: 5.0, y: 5.9 },
        capabilityWeights: {
          handle: 0.30,
          shoot: 0.32,
          decision: 0.24,
          pass: 0.14
        }
      },
      {
        id: "screen_reangle",
        objective: "Re-angle the screen to keep the on-ball defender attached",
        importance: 0.92,
        critical: true,
        target: { x: 5.2, y: 6.3 },
        capabilityWeights: {
          screen: 0.52,
          decision: 0.22,
          pass: 0.12,
          finish: 0.14
        }
      },
      {
        id: "rim_dive",
        objective: "Dive behind the drop defender and pressure the restricted area",
        importance: 0.93,
        critical: false,
        target: { x: 5.0, y: 1.7 },
        capabilityWeights: {
          finish: 0.50,
          cut: 0.24,
          screen: 0.12,
          decision: 0.14
        }
      },
      {
        id: "slot_lift",
        objective: "Lift into the slot to occupy the tag defender's passing lane",
        importance: 0.84,
        critical: false,
        target: { x: 8.0, y: 5.2 },
        capabilityWeights: {
          shoot: 0.52,
          pass: 0.18,
          cut: 0.14,
          decision: 0.16
        }
      },
      {
        id: "tag_punish",
        objective: "Cut or drift behind the low tag when the roller draws help",
        importance: 0.87,
        critical: false,
        target: { x: 2.3, y: 2.2 },
        capabilityWeights: {
          cut: 0.38,
          shoot: 0.30,
          finish: 0.18,
          decision: 0.14
        }
      }
    ];
  }

  if (state.defense?.mode === "scramble") {
    return [
      {
        id: "advance_outlet",
        objective: "Secure the outlet and advance before the defense can match",
        importance: 1,
        critical: true,
        target: { x: 4.8, y: 7.0 },
        capabilityWeights: {
          handle: 0.30,
          pass: 0.34,
          decision: 0.28,
          shoot: 0.08
        }
      },
      {
        id: "middle_fill",
        objective: "Fill the middle lane as a passing and decision hub",
        importance: 0.94,
        critical: true,
        target: { x: 5.0, y: 4.8 },
        capabilityWeights: {
          pass: 0.34,
          decision: 0.32,
          finish: 0.18,
          cut: 0.16
        }
      },
      {
        id: "corner_sprint",
        objective: "Sprint to the weak corner before the defense locates shooters",
        importance: 0.88,
        critical: false,
        target: { x: 8.6, y: 1.5 },
        capabilityWeights: {
          shoot: 0.60,
          cut: 0.22,
          decision: 0.18
        }
      },
      {
        id: "rim_run",
        objective: "Run to the rim and force the deepest defender to collapse",
        importance: 0.92,
        critical: false,
        target: { x: 4.6, y: 1.4 },
        capabilityWeights: {
          finish: 0.52,
          cut: 0.28,
          rebound: 0.10,
          decision: 0.10
        }
      },
      {
        id: "safety_balance",
        objective: "Stay above the play as the turnover and transition safety valve",
        importance: 0.80,
        critical: false,
        target: { x: 2.2, y: 5.6 },
        capabilityWeights: {
          decision: 0.32,
          pass: 0.22,
          shoot: 0.18,
          defend: 0.28
        }
      }
    ];
  }

  return [
    {
      id: "primary_creation",
      objective: "Create the first advantage from the top",
      importance: 1,
      critical: true,
      target: { x: 5.0, y: 7.8 },
      capabilityWeights: {
        handle: 0.55,
        pass: 0.25,
        decision: 0.20
      }
    },
    {
      id: "ball_screen",
      objective: "Create separation with a high ball screen",
      importance: 0.93,
      critical: true,
      target: { x: 5.2, y: 6.0 },
      capabilityWeights: {
        screen: 0.62,
        pass: 0.13,
        finish: 0.10,
        decision: 0.15
      }
    },
    {
      id: "strong_side_spacing",
      objective: "Stretch the strong-side help defender",
      importance: 0.82,
      critical: false,
      target: { x: 2.0, y: 5.4 },
      capabilityWeights: {
        shoot: 0.68,
        cut: 0.15,
        decision: 0.17
      }
    },
    {
      id: "weak_side_spacing",
      objective: "Hold weak-side gravity away from the action",
      importance: 0.82,
      critical: false,
      target: { x: 8.7, y: 2.0 },
      capabilityWeights: {
        shoot: 0.72,
        cut: 0.12,
        decision: 0.16
      }
    },
    {
      id: "rim_pressure",
      objective: "Threaten the rim and occupy the low defender",
      importance: 0.88,
      critical: false,
      target: { x: 3.7, y: 1.7 },
      capabilityWeights: {
        finish: 0.58,
        cut: 0.24,
        screen: 0.08,
        decision: 0.10
      }
    }
  ];
}

export function scoreBasketballTarget({
  agents,
  needs,
  assignment,
  previousAssignment = {},
  weights = {}
}) {
  const localityWeight = weights.locality ?? 0.42;
  const switchPenalty = weights.switchPenalty ?? 0.04;
  const movementPenalty = weights.movementPenalty ?? 0.035;

  let total = 0;
  const components = [];

  for (const need of needs) {
    const agentId = assignment[need.id];
    const agent = agents.find((item) => item.id === agentId);

    if (!agent) {
      return {
        total: -Infinity,
        components: [
          ...components,
          { needId: need.id, agentId: null, score: -Infinity }
        ]
      };
    }

    const fit = capabilityFit(agent, need);
    const local = locality(agent, need);
    const movement = distance(agent.location, need.target);
    const switched =
      previousAssignment[agent.id] != null &&
      previousAssignment[agent.id] !== need.id;

    const raw =
      need.importance * (fit + localityWeight * local) -
      movementPenalty * movement -
      (switched ? switchPenalty : 0);

    total += raw;
    components.push({
      needId: need.id,
      agentId: agent.id,
      capabilityFit: fit,
      locality: local,
      movement,
      switched,
      score: raw
    });
  }

  return { total, components };
}

export function solveBasketballCoordinationTarget({
  agents,
  state,
  previousAssignment = {},
  weights = {}
}) {
  const needs = deriveBasketballNeeds(state);

  if (needs.length === 0) {
    return createCoordinationTarget({
      id: `target:${state.stateVersion}`,
      goalId: state.goal?.id ?? "basketball-possession",
      stateVersion: state.stateVersion,
      requiredCoverage: [],
      assignment: {},
      score: 0
    });
  }

  if (agents.length < needs.length) {
    throw new TypeError("Not enough agents to cover basketball Needs");
  }

  const candidates = [];
  for (const perm of permutations(agents)) {
    const selected = perm.slice(0, needs.length);
    const assignment = Object.fromEntries(
      needs.map((need, index) => [need.id, selected[index].id])
    );
    const scored = scoreBasketballTarget({
      agents,
      needs,
      assignment,
      previousAssignment,
      weights
    });
    candidates.push({ assignment, ...scored });
  }

  candidates.sort((a, b) =>
    b.total - a.total ||
    JSON.stringify(a.assignment).localeCompare(
      JSON.stringify(b.assignment)
    )
  );

  const best = candidates[0];

  return {
    ...createCoordinationTarget({
      id: `target:${state.stateVersion}`,
      goalId: state.goal?.id ?? "basketball-possession",
      stateVersion: state.stateVersion,
      requiredCoverage: needs.map((need) => ({
        needId: need.id,
        critical: need.critical,
        objective: need.objective
      })),
      assignment: best.assignment,
      constraints: {
        maxUncoveredCriticalNeeds: 0,
        maxMutationContention: 0,
        maxConcurrentResponsibilities: needs.length
      },
      exitConditions: ["quality-shot-or-possession-end"],
      score: best.total
    }),
    goal: state.goal,
    needs,
    components: best.components,
    candidatesEvaluated: candidates.length
  };
}

const POSITION_FOR_NEED = {
  primary_creation: "PG",
  ball_screen: "PF",
  strong_side_spacing: "SG",
  weak_side_spacing: "SF",
  rim_pressure: "C",
  ball_security: "PG",
  release_outlet: "SF",
  short_roll_connector: "PF",
  weak_side_lift: "SG",
  rim_window: "C",
  mismatch_attack: "PG",
  ghost_rescreen: "PF",
  strong_corner_hold: "SG",
  weak_side_exchange: "SF",
  seal_window: "C",
  ball_reversal: "PG",
  nail_connector: "PF",
  weak_side_skip: "SG",
  baseline_drift: "SF",
  crash_balance: "C",
  top_reversal: "PG",
  high_post_flash: "PF",
  short_corner_occupancy: "C",
  zone_skip_window: "SG",
  zone_glass_balance: "SF",
  pocket_pullup: "PG",
  screen_reangle: "PF",
  rim_dive: "C",
  slot_lift: "SG",
  tag_punish: "SF",
  advance_outlet: "PG",
  middle_fill: "PF",
  corner_sprint: "SG",
  rim_run: "C",
  safety_balance: "SF"
};

const PREDEFINED_FUNCTION_FOR_NEED = {
  primary_creation: "creator",
  ball_screen: "screener",
  strong_side_spacing: "wing",
  weak_side_spacing: "shooter",
  rim_pressure: "big",
  ball_security: "creator",
  release_outlet: "wing",
  short_roll_connector: "screener",
  weak_side_lift: "shooter",
  rim_window: "big",
  mismatch_attack: "creator",
  ghost_rescreen: "screener",
  strong_corner_hold: "shooter",
  weak_side_exchange: "wing",
  seal_window: "big",
  ball_reversal: "creator",
  nail_connector: "screener",
  weak_side_skip: "shooter",
  baseline_drift: "wing",
  crash_balance: "big",
  top_reversal: "creator",
  high_post_flash: "screener",
  short_corner_occupancy: "big",
  zone_skip_window: "shooter",
  zone_glass_balance: "wing",
  pocket_pullup: "creator",
  screen_reangle: "screener",
  rim_dive: "big",
  slot_lift: "shooter",
  tag_punish: "wing",
  advance_outlet: "creator",
  middle_fill: "screener",
  corner_sprint: "shooter",
  rim_run: "big",
  safety_balance: "wing"
};

const PREDEFINED_FUNCTION_PROFILES = {
  creator: {
    handle: 0.52,
    pass: 0.28,
    decision: 0.20
  },
  shooter: {
    shoot: 0.76,
    cut: 0.10,
    decision: 0.14
  },
  screener: {
    screen: 0.62,
    pass: 0.18,
    finish: 0.08,
    decision: 0.12
  },
  wing: {
    shoot: 0.25,
    pass: 0.15,
    cut: 0.40,
    decision: 0.20
  },
  big: {
    finish: 0.48,
    screen: 0.30,
    pass: 0.08,
    decision: 0.14
  }
};

function functionProfileScore(agent, functionName) {
  const profile = PREDEFINED_FUNCTION_PROFILES[functionName];
  return Object.entries(profile).reduce(
    (sum, [capability, weight]) =>
      sum + weight * (agent.capabilities?.[capability] ?? 0),
    0
  );
}

export function fixedPositionBaseline({ agents, state }) {
  const needs = deriveBasketballNeeds(state);
  const assignment = {};

  for (const need of needs) {
    const nominalPosition = POSITION_FOR_NEED[need.id];
    const agent = agents.find(
      (item) => item.nominalPosition === nominalPosition
    );
    if (agent) assignment[need.id] = agent.id;
  }

  return { needs, assignment };
}

export function fixedArchetypeBaseline({ agents, state }) {
  const needs = deriveBasketballNeeds(state);
  const ownership = {
    creator: "advantage_creator",
    shooter: "shooter",
    screener: "screener",
    wing: "cutter",
    big: "rim_finisher"
  };
  const candidates = [];

  for (const perm of permutations(agents)) {
    const assignment = Object.fromEntries(
      needs.map((need, index) => [need.id, perm[index].id])
    );

    const score = needs.reduce((sum, need) => {
      const functionName = PREDEFINED_FUNCTION_FOR_NEED[need.id];
      const archetypeId = ownership[functionName];
      const agentId = assignment[need.id];
      const agent = agents.find((item) => item.id === agentId);
      const strength =
        agent.archetypes?.find((a) => a.id === archetypeId)?.strength ?? 0;
      return sum + need.importance * strength;
    }, 0);

    candidates.push({ assignment, score });
  }

  candidates.sort((a, b) =>
    b.score - a.score ||
    JSON.stringify(a.assignment).localeCompare(
      JSON.stringify(b.assignment)
    )
  );

  return {
    needs,
    assignment: candidates[0].assignment,
    archetypeScore: candidates[0].score,
    candidatesEvaluated: candidates.length
  };
}

export function dynamicPredefinedRoleBaseline({ agents, state }) {
  const needs = deriveBasketballNeeds(state);
  const candidates = [];

  for (const perm of permutations(agents)) {
    const assignment = Object.fromEntries(
      needs.map((need, index) => [need.id, perm[index].id])
    );

    const score = needs.reduce((sum, need) => {
      const functionName = PREDEFINED_FUNCTION_FOR_NEED[need.id];
      const agentId = assignment[need.id];
      const agent = agents.find((item) => item.id === agentId);
      return sum + need.importance * functionProfileScore(
        agent,
        functionName
      );
    }, 0);

    candidates.push({ assignment, score });
  }

  candidates.sort((a, b) =>
    b.score - a.score ||
    JSON.stringify(a.assignment).localeCompare(
      JSON.stringify(b.assignment)
    )
  );

  return {
    needs,
    assignment: candidates[0].assignment,
    functionScore: candidates[0].score,
    candidatesEvaluated: candidates.length
  };
}

export function runLastPossessionMechanismTest(scenario) {
  const initial = solveBasketballCoordinationTarget({
    agents: scenario.agents,
    state: scenario.initialState
  });

  const previousAssignment = Object.fromEntries(
    Object.entries(initial.assignment).map(([needId, agentId]) => [
      agentId,
      needId
    ])
  );

  const plh = solveBasketballCoordinationTarget({
    agents: scenario.agents,
    state: scenario.trapState,
    previousAssignment
  });

  const fixed = fixedPositionBaseline({
    agents: scenario.agents,
    state: scenario.trapState
  });

  const fixedArchetype = fixedArchetypeBaseline({
    agents: scenario.agents,
    state: scenario.trapState
  });

  const dynamicRoles = dynamicPredefinedRoleBaseline({
    agents: scenario.agents,
    state: scenario.trapState
  });

  const plhScore = scoreBasketballTarget({
    agents: scenario.agents,
    needs: plh.needs,
    assignment: plh.assignment,
    previousAssignment
  }).total;

  const fixedScore = scoreBasketballTarget({
    agents: scenario.agents,
    needs: fixed.needs,
    assignment: fixed.assignment,
    previousAssignment
  }).total;

  const fixedArchetypeScore = scoreBasketballTarget({
    agents: scenario.agents,
    needs: fixedArchetype.needs,
    assignment: fixedArchetype.assignment,
    previousAssignment
  }).total;

  const dynamicRoleScore = scoreBasketballTarget({
    agents: scenario.agents,
    needs: dynamicRoles.needs,
    assignment: dynamicRoles.assignment,
    previousAssignment
  }).total;

  const shift = {
    plh: {
      assignment: plh.assignment,
      score: plhScore,
      oracleRegret: 0
    },
    fixedPosition: {
      assignment: fixed.assignment,
      score: fixedScore,
      oracleRegret: plhScore - fixedScore
    },
    fixedArchetype: {
      assignment: fixedArchetype.assignment,
      score: fixedArchetypeScore,
      oracleRegret: plhScore - fixedArchetypeScore
    },
    dynamicPredefinedRoles: {
      assignment: dynamicRoles.assignment,
      score: dynamicRoleScore,
      oracleRegret: plhScore - dynamicRoleScore,
      candidatesEvaluated: dynamicRoles.candidatesEvaluated
    }
  };

  return {
    schemaVersion: 1,
    scenarioId: scenario.scenarioId,
    stateMode: scenario.trapState?.defense?.mode ?? null,
    initialTarget: initial,
    trapTarget: plh,
    shiftTarget: plh,
    shift,
    trap: shift
  };
}

