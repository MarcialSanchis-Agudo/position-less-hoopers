import assert from "node:assert/strict";
import test from "node:test";
import {
  capabilityThresholdForLocality,
  contextCalibrationCell,
  runContextCalibrationGrid
} from "../src/index.mjs";

test("P1 calibration: frozen locality coefficient implies a 0.35 capability threshold", () => {
  assert.equal(capabilityThresholdForLocality(), 0.35);
});

test("P1 calibration: situated candidate wins just below the matcher threshold", () => {
  const cell = contextCalibrationCell({
    capabilityGap: 0.34,
    trueMissingContextPenalty: 0.4
  });

  assert.equal(cell.selectedCandidateId, "situated");
});

test("P1 calibration: higher-capability candidate wins just above the matcher threshold", () => {
  const cell = contextCalibrationCell({
    capabilityGap: 0.36,
    trueMissingContextPenalty: 0.4
  });

  assert.equal(cell.selectedCandidateId, "high-capability");
});

test("P1 calibration: matcher overvalues locality when true reload penalty is small", () => {
  const cell = contextCalibrationCell({
    capabilityGap: 0.2,
    trueMissingContextPenalty: 0.1
  });

  assert.equal(cell.selectedCandidateId, "situated");
  assert.equal(cell.optimalCandidateId, "high-capability");
  assert.ok(cell.regret > 0);
});

test("P1 calibration: matcher values locality correctly when true reload penalty is large", () => {
  const cell = contextCalibrationCell({
    capabilityGap: 0.2,
    trueMissingContextPenalty: 0.4
  });

  assert.equal(cell.selectedCandidateId, "situated");
  assert.equal(cell.optimalCandidateId, "situated");
  assert.equal(cell.regret, 0);
});

test("P1 calibration: grid exposes the calibration problem explicitly", () => {
  const result = runContextCalibrationGrid();

  assert.equal(result.decisionThreshold, 0.35);
  assert.equal(result.summary.cells, 66);
  assert.ok(result.summary.mistakes > 0);
  assert.ok(result.summary.accuracy < 1);

  const lowPenalty = result.byPenalty.find((row) => row.trueMissingContextPenalty === 0.1);
  const highPenalty = result.byPenalty.find((row) => row.trueMissingContextPenalty === 0.4);

  assert.ok(lowPenalty.mistakes > 0);
  assert.ok(highPenalty.accuracy >= lowPenalty.accuracy);
});

