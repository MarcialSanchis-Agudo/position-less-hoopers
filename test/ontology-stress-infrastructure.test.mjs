import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,"..");
const runner=path.join(root,"scripts/run-ontology-stress-matrix-v0.3.1.mjs");
const evalSet="benchmarks/courtshift/ontology-stress-eval-v0.3.1.json";
const ontology="benchmarks/courtshift/ontology-stress-baselines-v0.3.json";

test("v0.3.1 pauses on executor infrastructure failure without advancing scientific schedule",()=>{
  const out=`results/test/ontology-stress-infra-${process.pid}`;
  const result=spawnSync(process.execPath,[
    runner,
    evalSet,
    ontology,
    out,
    "examples/adapters/failing-claude-agent.json",
    "1",
    "30"
  ],{cwd:root,encoding:"utf8",timeout:120000});

  assert.equal(result.status,3,result.stdout+result.stderr);

  const checkpoint=JSON.parse(fs.readFileSync(path.join(root,out,"ontology-stress-checkpoint.json"),"utf8"));
  const progress=JSON.parse(fs.readFileSync(path.join(root,out,"ontology-stress-progress.json"),"utf8"));

  assert.equal(checkpoint.nextCellIndex,0);
  assert.equal(checkpoint.records.length,0);
  assert.equal(checkpoint.infrastructureFailures.length,1);
  assert.equal(progress.status,"paused_on_infrastructure_failure");
  assert.equal(progress.completedScientificRunCount,0);
  assert.equal(progress.lastInfrastructureFailure.diagnostics.claude.claudeExitCode,1);
  assert.equal(progress.lastInfrastructureFailure.diagnostics.claude.publicTestExitCode,0);
});

test("v0.3.1 reference matrix resumes from checkpoint and emits final summary only when complete",()=>{
  const out=`results/test/ontology-stress-resume-${process.pid}`;

  const first=spawnSync(process.execPath,[
    runner,
    evalSet,
    ontology,
    out,
    "examples/adapters/reference-agent.json",
    "1",
    "7"
  ],{cwd:root,encoding:"utf8",timeout:120000});
  assert.equal(first.status,0,first.stdout+first.stderr);

  let checkpoint=JSON.parse(fs.readFileSync(path.join(root,out,"ontology-stress-checkpoint.json"),"utf8"));
  assert.equal(checkpoint.nextCellIndex,7);
  assert.equal(checkpoint.records.length,7);
  assert.equal(fs.existsSync(path.join(root,out,"ontology-stress-matrix-summary.json")),false);

  const second=spawnSync(process.execPath,[
    runner,
    evalSet,
    ontology,
    out,
    "examples/adapters/reference-agent.json",
    "1",
    "23"
  ],{cwd:root,encoding:"utf8",timeout:120000});
  assert.equal(second.status,0,second.stdout+second.stderr);

  checkpoint=JSON.parse(fs.readFileSync(path.join(root,out,"ontology-stress-checkpoint.json"),"utf8"));
  const summary=JSON.parse(fs.readFileSync(path.join(root,out,"ontology-stress-matrix-summary.json"),"utf8"));

  assert.equal(checkpoint.nextCellIndex,30);
  assert.equal(checkpoint.records.length,30);
  assert.equal(checkpoint.infrastructureFailures.length,0);
  assert.equal(summary.complete,true);
  assert.equal(summary.completedScientificRunCount,30);
  assert.equal(summary.infrastructureFailureCount,0);
  assert.equal(summary.mechanismComparison.stressPairCount,2);
  assert.equal(summary.mechanismComparison.workerDivergenceCount,2);
  assert.equal(summary.mechanismComparison.zeroB3RoleContextCoverageCount,2);
});
