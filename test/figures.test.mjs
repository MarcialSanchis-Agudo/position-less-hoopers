import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCoordinationField,
  comparePoliciesAcrossSeeds,
  renderCalibrationHeatmap,
  renderCoordinationCycleFigure,
  renderCourtShiftFigure,
  renderPolicyRegimeFigure,
  renderRegimeSweepFigure,
  renderSensitivityFigure,
  renderSwitchingPilotFigure,
  renderTriggerPolicyFigure,
  renderTriggerSensitivityFigure,
  renderHoopersArenaFigure,
  runLastPossessionMechanismTest,
  compareSwitchingPolicies,
  compareTriggerPolicies,
  runTriggerThresholdSweep,
  summarizeTriggerScenarios,
  runContextCalibrationGrid,
  runContextCostRegimeSweep,
  runSituatednessWeightSweep
} from "../src/index.mjs";

test("figures: P2.5 coordination cycle exposes satisfaction and reopening", () => {
  const svg = renderCoordinationCycleFigure();

  assert.match(svg, /PLH deterministic coordination cycle/);
  assert.match(svg, /Need satisfied/);
  assert.match(svg, /Need reopened/);
  assert.match(svg, /reassignment preserves Need identity/);
});

test("figures: sensitivity renderer emits accessible SVG", () => {
  const svg = renderSensitivityFigure(runSituatednessWeightSweep());
  assert.match(svg, /^<svg/);
  assert.match(svg, /P1 situatedness sensitivity/);
  assert.match(svg, /Frozen P1 = 0.35/);
});

test("figures: calibration heatmap encodes decision cells", () => {
  const svg = renderCalibrationHeatmap(runContextCalibrationGrid());
  assert.match(svg, /Capability gap × true context-loss cost/);
  assert.match(svg, />S</);
  assert.match(svg, />C</);
});

test("figures: policy regime plot compares cheap and expensive reloads", () => {
  const cheap = comparePoliciesAcrossSeeds({
    trueMissingContextPenalty: 0.03,
    seeds: [1, 2, 3, 4, 5]
  });
  const expensive = comparePoliciesAcrossSeeds({
    trueMissingContextPenalty: 0.4,
    seeds: [1, 2, 3, 4, 5]
  });
  const svg = renderPolicyRegimeFigure({ cheap, expensive });

  assert.match(svg, /Cheap reload \(0.03\)/);
  assert.match(svg, /Expensive reload \(0.40\)/);
  assert.match(svg, /capability \+ situated/);
});

test("figures: regime sweep renderer exposes the crossover", () => {
  const sweep = runContextCostRegimeSweep({
    penalties: [0, 0.1, 0.2, 0.3, 0.4, 0.5],
    seeds: [1, 2, 3, 4, 5]
  });
  const svg = renderRegimeSweepFigure(sweep);

  assert.match(svg, /Context cost changes the best coordination law/);
  assert.match(svg, /synthetic crossover/);
  assert.match(svg, /capability \+ situatedness/);
});

test("figures: switching pilot compares churn and recovery", async () => {
  const scenario = JSON.parse(await (await import("node:fs/promises")).readFile(
    new URL("../benchmarks/courtshift/scenarios/switching-pilot.json", import.meta.url),
    "utf8"
  ));
  const comparison = compareSwitchingPolicies(scenario, {
    switchPolicy: {
      switchMargin: 0.10,
      minTenureMs: 120000,
      cooldownMs: 180000
    }
  });
  const svg = renderSwitchingPilotFigure(comparison);

  assert.match(svg, /P4 switching pilot/);
  assert.match(svg, /no_switch/);
  assert.match(svg, /greedy_switch/);
  assert.match(svg, /plh_hysteresis/);
});

test("figures: trigger policy and threshold sensitivity renderers emit SVG", async () => {
  const fs = await import("node:fs/promises");
  const names = [
    "trigger-coupled-signals.json",
    "trigger-noise-only.json",
    "trigger-slow-drift.json"
  ];
  const scenarios = await Promise.all(names.map(async (name) =>
    JSON.parse(await fs.readFile(
      new URL(`../benchmarks/courtshift/scenarios/${name}`, import.meta.url),
      "utf8"
    ))
  ));

  const comparisons = scenarios.map((scenario) => compareTriggerPolicies(scenario));
  const summary = summarizeTriggerScenarios(comparisons);
  const sweep = runTriggerThresholdSweep({ scenarios });

  const policySvg = renderTriggerPolicyFigure(summary);
  const sensitivitySvg = renderTriggerSensitivityFigure(sweep);

  assert.match(policySvg, /P5b trigger policy comparison/);
  assert.match(policySvg, /plh_pressure/);
  assert.match(sensitivitySvg, /P5b threshold sensitivity/);
  assert.match(sensitivitySvg, /node τ=/);
});

test("figures: Hoopers Arena renders the 5v5 oracle target", async () => {
  const fs = await import("node:fs/promises");
  const scenario = JSON.parse(await fs.readFile(
    new URL("../examples/hoopers-arena/scenarios/last-possession.json", import.meta.url),
    "utf8"
  ));
  const result = runLastPossessionMechanismTest(scenario);
  const svg = renderHoopersArenaFigure({ scenario, result });

  assert.match(svg, /LAST POSSESSION/);
  assert.match(svg, /120 feasible 5v5 assignments/);
  assert.match(svg, /NEED-FIRST \/ PLH/);
  assert.match(svg, /ORACLE REGRET/);
});

test("figures: court renderer exposes covered and uncovered states", () => {
  const before = buildCoordinationField({
    goalId: "g",
    agents: [{ sessionId: "s", lifecycle: "active" }],
    work: [{ workId: "w", stepId: "implement", status: "active", assignedSessionId: "s" }]
  }, { observedAt: "t0" });

  const after = buildCoordinationField({
    goalId: "g",
    agents: [{ sessionId: "s", lifecycle: "stopped" }],
    work: [{ workId: "w", stepId: "implement", status: "active", assignedSessionId: "s" }]
  }, { observedAt: "t1" });

  const svg = renderCourtShiftFigure({ before, after });
  assert.match(svg, /Before perturbation/);
  assert.match(svg, /After worker loss/);
  assert.match(svg, /covered/);
  assert.match(svg, /uncovered/);
});

