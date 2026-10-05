import { chooseCandidate, DEFAULT_P1_WEIGHTS } from "./matcher.mjs";

const CAPABILITIES = ["implement", "verify", "research"];
const CONTEXTS = [
  "ctx://auth",
  "ctx://payments",
  "ctx://cache",
  "ctx://api",
  "ctx://storage",
  "ctx://tests"
];

function prng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pick(random, values) {
  return values[Math.floor(random() * values.length)];
}

function agentId(index) {
  return String.fromCharCode("a".charCodeAt(0) + index);
}

function buildAgents(random, count) {
  return Array.from({ length: count }, (_, index) => {
    const capabilityScores = Object.fromEntries(
      CAPABILITIES.map((key) => [key, 0.55 + random() * 0.45])
    );

    return {
      id: agentId(index),
      capabilities: [...CAPABILITIES],
      capabilityScores,
      contextRefs: [pick(random, CONTEXTS)],
      artifactRefs: [],
      available: true,
      expectedCost: 0,
      switchCost: 0
    };
  });
}

function cloneAgents(agents) {
  return agents.map((agent) => ({
    ...agent,
    capabilities: [...agent.capabilities],
    capabilityScores: { ...agent.capabilityScores },
    contextRefs: [...agent.contextRefs],
    artifactRefs: [...agent.artifactRefs]
  }));
}

function updateContext(agent, contextRef, contextWindow) {
  agent.contextRefs = [
    contextRef,
    ...agent.contextRefs.filter((ref) => ref !== contextRef)
  ].slice(0, contextWindow);
}

function realizedUtility(candidate, need, trueMissingContextPenalty) {
  const capability = candidate.capabilityScores[need.requiredCapabilities[0]] ?? 0;
  const hasContext = candidate.contextRefs.includes(need.contextRefs[0]);
  return {
    utility: capability - (hasContext ? 0 : trueMissingContextPenalty),
    capability,
    contextReload: !hasContext
  };
}

function fixedStaticPreferences(agents) {
  return agents.map((agent) => agent.id);
}

function generateEpisode(seed, {
  steps,
  agentCount,
  availabilityPerturbationEvery
}) {
  const random = prng(seed);
  const initialAgents = buildAgents(random, agentCount);
  const staticPreference = fixedStaticPreferences(initialAgents);
  const needs = [];

  for (let step = 0; step < steps; step += 1) {
    const capability = pick(random, CAPABILITIES);
    const contextRef = pick(random, CONTEXTS);
    const unavailableId =
      availabilityPerturbationEvery > 0 &&
      step > 0 &&
      step % availabilityPerturbationEvery === 0
        ? pick(random, initialAgents.map((agent) => agent.id))
        : null;

    needs.push({
      id: `need-${step}`,
      requiredCapabilities: [capability],
      contextRefs: [contextRef],
      staticPreference,
      unavailableId
    });
  }

  return { initialAgents, needs };
}

export function simulateTeamEpisode({
  seed = 1,
  mode = "capability_situated",
  trueMissingContextPenalty = 0.3,
  steps = 200,
  agentCount = 4,
  contextWindow = 2,
  availabilityPerturbationEvery = 17,
  matcherWeights = DEFAULT_P1_WEIGHTS
} = {}) {
  const { initialAgents, needs } = generateEpisode(seed, {
    steps,
    agentCount,
    availabilityPerturbationEvery
  });
  const agents = cloneAgents(initialAgents);

  let totalUtility = 0;
  let contextReloads = 0;
  let noFeasibleCandidate = 0;
  let perturbationSteps = 0;
  const selections = Object.fromEntries(agents.map((agent) => [agent.id, 0]));

  for (const need of needs) {
    for (const agent of agents) {
      agent.available = agent.id !== need.unavailableId;
    }
    if (need.unavailableId) perturbationSteps += 1;

    const choice = chooseCandidate(agents, need, {
      mode,
      weights: matcherWeights
    });

    if (choice.candidateId == null) {
      noFeasibleCandidate += 1;
      continue;
    }

    const selected = agents.find((agent) => agent.id === choice.candidateId);
    const realized = realizedUtility(selected, need, trueMissingContextPenalty);

    totalUtility += realized.utility;
    if (realized.contextReload) contextReloads += 1;
    selections[selected.id] += 1;

    updateContext(selected, need.contextRefs[0], contextWindow);
  }

  return {
    seed,
    mode,
    trueMissingContextPenalty,
    steps,
    agentCount,
    contextWindow,
    perturbationSteps,
    totalUtility,
    meanUtility: totalUtility / (steps - noFeasibleCandidate),
    contextReloads,
    contextReloadRate: contextReloads / (steps - noFeasibleCandidate),
    noFeasibleCandidate,
    selections
  };
}

export function comparePoliciesAcrossSeeds({
  seeds = Array.from({ length: 20 }, (_, index) => index + 1),
  modes = ["static", "capability", "capability_situated"],
  ...options
} = {}) {
  const runs = [];

  for (const seed of seeds) {
    for (const mode of modes) {
      runs.push(simulateTeamEpisode({
        seed,
        mode,
        ...options
      }));
    }
  }

  const summary = modes.map((mode) => {
    const subset = runs.filter((run) => run.mode === mode);
    const sum = (key) => subset.reduce((total, run) => total + run[key], 0);

    return {
      mode,
      episodes: subset.length,
      meanUtility: sum("meanUtility") / subset.length,
      meanContextReloadRate: sum("contextReloadRate") / subset.length,
      meanNoFeasibleCandidate: sum("noFeasibleCandidate") / subset.length
    };
  });

  return {
    schemaVersion: 1,
    options: {
      seeds,
      modes,
      ...options
    },
    runs,
    summary
  };
}

