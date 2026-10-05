import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCoordinationField,
  comparePoliciesAcrossSeeds,
  compareSwitchingPolicies,
  compareTriggerPolicies,
  runTriggerThresholdSweep,
  summarizeTriggerScenarios,
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
  evaluateHoopersArenaSuite,
  runContextCalibrationGrid,
  runContextCostRegimeSweep,
  runSituatednessWeightSweep
} from "../src/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const figuresDir = path.join(root, "artifacts", "figures");
const dataDir = path.join(root, "artifacts", "data");
const visualizerDir = path.join(root, "visualizer");

await fs.mkdir(figuresDir, { recursive: true });
await fs.mkdir(dataDir, { recursive: true });
await fs.mkdir(visualizerDir, { recursive: true });

const seeds = Array.from({ length: 50 }, (_, index) => index + 1);
const sensitivity = runSituatednessWeightSweep();
const calibration = runContextCalibrationGrid();
const regimeSweep = runContextCostRegimeSweep({ seeds });
const cheap = comparePoliciesAcrossSeeds({
  trueMissingContextPenalty: 0.03,
  seeds
});
const expensive = comparePoliciesAcrossSeeds({
  trueMissingContextPenalty: 0.40,
  seeds
});

const readJson = async (rel) => JSON.parse(await fs.readFile(path.join(root, rel), "utf8"));
const cleanInput = await readJson("fixtures/p0/clean.json");
const lossInput = await readJson("fixtures/p0/perturbed-worker-loss.json");
const switchingScenario = await readJson("benchmarks/courtshift/scenarios/switching-pilot.json");
const hoopersScenario = await readJson("examples/hoopers-arena/scenarios/last-possession.json");
const hoopersSuiteSpec = await readJson("examples/hoopers-arena/state-shifts.json");
const triggerScenarios = await Promise.all([
  "trigger-coupled-signals.json",
  "trigger-noise-only.json",
  "trigger-slow-drift.json"
].map((name) => readJson(`benchmarks/courtshift/scenarios/${name}`)));
const clean = buildCoordinationField(cleanInput, { observedAt: cleanInput.observedAt });
const loss = buildCoordinationField(lossInput, { observedAt: lossInput.observedAt });
const switchingPilot = compareSwitchingPolicies(switchingScenario, {
  switchPolicy: {
    switchMargin: 0.10,
    minTenureMs: 120000,
    cooldownMs: 180000
  }
});
const triggerComparisons = triggerScenarios.map((scenario) =>
  compareTriggerPolicies(scenario)
);
const triggerSummary = summarizeTriggerScenarios(triggerComparisons);
const triggerSensitivity = runTriggerThresholdSweep({
  scenarios: triggerScenarios
});
const hoopersArena = runLastPossessionMechanismTest(hoopersScenario);
const hoopersSuite = evaluateHoopersArenaSuite(
  hoopersScenario,
  hoopersSuiteSpec
);

const outputs = [
  ["p2-coordination-cycle.svg", renderCoordinationCycleFigure()],
  ["p1-situatedness-sensitivity.svg", renderSensitivityFigure(sensitivity)],
  ["p1-context-calibration.svg", renderCalibrationHeatmap(calibration)],
  ["p1-policy-regimes.svg", renderPolicyRegimeFigure({ cheap, expensive })],
  ["p1-context-cost-crossover.svg", renderRegimeSweepFigure(regimeSweep)],
  ["p4-switching-pilot.svg", renderSwitchingPilotFigure(switchingPilot)],
  ["p5b-trigger-policy.svg", renderTriggerPolicyFigure(triggerSummary)],
  ["p5b-trigger-sensitivity.svg", renderTriggerSensitivityFigure(triggerSensitivity)],
  ["hoopers-arena-last-possession.svg", renderHoopersArenaFigure({
    scenario: hoopersScenario,
    result: hoopersArena
  })],
  ["p0-courtshift-worker-loss.svg", renderCourtShiftFigure({ before: clean, after: loss })]
];

for (const [name, svg] of outputs) {
  await fs.writeFile(path.join(figuresDir, name), svg, "utf8");
}

const dataArtifacts = {
  "p1-situatedness-sensitivity.json": sensitivity,
  "p1-policy-regimes.json": { cheap, expensive },
  "p1-context-cost-crossover.json": regimeSweep,
  "p4-switching-pilot.json": switchingPilot,
  "p5b-trigger-policy.json": {
    comparisons: triggerComparisons,
    summary: triggerSummary
  },
  "p5b-trigger-sensitivity.json": triggerSensitivity,
  "hoopers-arena-last-possession.json": hoopersArena,
  "hoopers-arena-state-shifts.json": hoopersSuite,
  "p0-courtshift-worker-loss.json": { before: clean, after: loss }
};

for (const [name, data] of Object.entries(dataArtifacts)) {
  await fs.writeFile(path.join(dataDir, name), JSON.stringify(data, null, 2) + "\n");
}

const dashboardData = {
  generatedAt: new Date().toISOString(),
  testLevel: "synthetic-development",
  sensitivity: {
    bestWeights: sensitivity.bestWeights,
    frozenWeight: 0.35,
    frozenMeanRegret: sensitivity.rows.find((row) => row.situatednessWeight === 0.35)?.meanRegret ?? null,
    bestMeanRegret: sensitivity.bestMeanRegret
  },
  crossover: {
    estimatedPenalty: regimeSweep.estimatedCrossoverPenalty,
    rows: regimeSweep.rows
  },
  policyRegimes: {
    cheapPenalty: 0.03,
    expensivePenalty: 0.40,
    cheap: cheap.summary,
    expensive: expensive.summary
  },
  switchingPilot,
  triggerSummary,
  triggerSensitivity,
  hoopersArena
};

await fs.writeFile(
  path.join(visualizerDir, "experiment-data.js"),
  `window.PLH_EXPERIMENT_DATA = ${JSON.stringify(dashboardData, null, 2)};\n`,
  "utf8"
);

process.stdout.write(`Generated ${outputs.length} figures and ${Object.keys(dataArtifacts).length} data artifacts.\n`);

