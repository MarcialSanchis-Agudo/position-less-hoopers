import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,"..");
const runner=path.join(root,"scripts/run-ontology-stress-matrix-v0.3.2.mjs");
const evalSet="benchmarks/courtshift/ontology-stress-eval-v0.3.2-openai.json";
const ontology="benchmarks/courtshift/ontology-stress-baselines-v0.3.json";

test("v0.3.2 detects provider-neutral Codex infrastructure failure and does not advance",()=>{
  const out=`results/test/ontology-stress-openai-infra-${process.pid}`;
  const result=spawnSync(process.execPath,[
    runner,
    evalSet,
    ontology,
    out,
    "examples/adapters/failing-codex-agent.json",
    "1",
    "10"
  ],{cwd:root,encoding:"utf8",timeout:120000});

  assert.equal(result.status,3,result.stdout+result.stderr);

  const checkpoint=JSON.parse(fs.readFileSync(
    path.join(root,out,"ontology-stress-checkpoint.json"),
    "utf8"
  ));
  const progress=JSON.parse(fs.readFileSync(
    path.join(root,out,"ontology-stress-progress.json"),
    "utf8"
  ));

  assert.equal(checkpoint.nextCellIndex,0);
  assert.equal(checkpoint.records.length,0);
  assert.equal(checkpoint.infrastructureFailures.length,1);
  assert.equal(progress.status,"paused_on_infrastructure_failure");

  const diagnostics=
    progress.lastInfrastructureFailure.diagnostics.provider;
  assert.equal(diagnostics.provider,"OpenAI");
  assert.equal(diagnostics.cli,"Codex CLI");
  assert.equal(diagnostics.agentExitCode,1);
  assert.equal(diagnostics.publicTestExitCode,0);
});

test("v0.3.2 provider-neutral runner completes reference smoke with unchanged mechanism",()=>{
  const out=`results/test/ontology-stress-openai-reference-${process.pid}`;
  const result=spawnSync(process.execPath,[
    runner,
    evalSet,
    ontology,
    out,
    "examples/adapters/reference-agent.json",
    "1",
    "30"
  ],{cwd:root,encoding:"utf8",timeout:120000});

  assert.equal(result.status,0,result.stdout+result.stderr);

  const summary=JSON.parse(fs.readFileSync(
    path.join(root,out,"ontology-stress-matrix-summary.json"),
    "utf8"
  ));

  assert.equal(summary.complete,true);
  assert.equal(summary.completedScientificRunCount,30);
  assert.equal(summary.infrastructureFailureCount,0);
  assert.equal(summary.mechanismComparison.stressPairCount,2);
  assert.equal(summary.mechanismComparison.workerDivergenceCount,2);
  assert.equal(summary.mechanismComparison.zeroB3RoleContextCoverageCount,2);
});
