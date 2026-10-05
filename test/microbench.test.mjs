import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  runMicrobenchmarkScenario,
  summarizeMicrobenchmark
} from "../src/index.mjs";

async function scenarios() {
  const data = JSON.parse(
    await fs.readFile(new URL("../fixtures/p1/scenarios.json", import.meta.url), "utf8")
  );
  return data;
}

test("P1 microbench: all scenarios execute under all three modes", async () => {
  const data = await scenarios();
  const runs = data.scenarios.map((scenario) =>
    runMicrobenchmarkScenario({
      ...scenario,
      matcherWeights: data.matcherWeights
    })
  );

  assert.equal(runs.length, 4);
  for (const run of runs) {
    assert.deepEqual(run.results.map((item) => item.mode), [
      "static",
      "capability",
      "capability_situated"
    ]);
  }
});

test("P1 microbench: situated matcher captures the locality scenario", async () => {
  const data = await scenarios();
  const scenario = data.scenarios.find((item) => item.id === "locality-beats-small-capability-edge");
  const run = runMicrobenchmarkScenario({
    ...scenario,
    matcherWeights: data.matcherWeights
  });

  const capability = run.results.find((item) => item.mode === "capability");
  const situated = run.results.find((item) => item.mode === "capability_situated");

  assert.equal(capability.candidateId, "a");
  assert.equal(situated.candidateId, "b");
  assert.ok(situated.realizedUtility > capability.realizedUtility);
});

test("P1 microbench: capability can remain preferable when capability gap is large", async () => {
  const data = await scenarios();
  const scenario = data.scenarios.find((item) => item.id === "large-capability-edge-beats-locality");
  const run = runMicrobenchmarkScenario({
    ...scenario,
    matcherWeights: data.matcherWeights
  });

  const situated = run.results.find((item) => item.mode === "capability_situated");
  assert.equal(situated.candidateId, "a");
});

test("P1 microbench: summary exposes utility and regret without claiming real-agent performance", async () => {
  const data = await scenarios();
  const runs = data.scenarios.map((scenario) =>
    runMicrobenchmarkScenario({
      ...scenario,
      matcherWeights: data.matcherWeights
    })
  );
  const summary = summarizeMicrobenchmark(runs);

  assert.equal(summary.length, 3);
  for (const row of summary) {
    assert.equal(row.scenarios, 4);
    assert.ok(Number.isFinite(row.meanUtility));
    assert.ok(Number.isFinite(row.meanRegret));
  }
});

