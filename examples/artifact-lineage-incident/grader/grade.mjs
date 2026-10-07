import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const workspace = process.argv[2];
const contractVersion = Number(process.argv[3] ?? 2);
if (!workspace) process.exit(2);

const moduleUrl = pathToFileURL(path.resolve(workspace, "src/artifacts.mjs")).href;
const { resolveArtifacts } = await import(moduleUrl + `?grader=${Date.now()}`);
const checks = [];
function check(name, fn) {
  try { fn(); checks.push({ name, ok: true }); }
  catch (error) {
    checks.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

check("v1-deterministic-dedupe", () => {
  assert.deepEqual(resolveArtifacts([
    { artifactId: "a", source: "b", checksum: "late", createdAt: "2026-01-02" },
    { artifactId: "a", source: "a", checksum: "early", createdAt: "2026-01-01" },
    { artifactId: "b", source: "x", checksum: "x", createdAt: "2026-01-01" }
  ], {}), [
    { artifactId: "a", source: "a", checksum: "early" },
    { artifactId: "b", source: "x", checksum: "x" }
  ]);
});

if (contractVersion >= 2) {
  check("v2-source-priority", () => {
    assert.deepEqual(resolveArtifacts([
      { artifactId: "a", source: "slow", checksum: "1", createdAt: "2026-01-01" },
      { artifactId: "a", source: "fast", checksum: "2", createdAt: "2026-01-02" }
    ], { sourcePriority: ["fast", "slow"] }), [
      { artifactId: "a", source: "fast", checksum: "2" }
    ]);
  });
  check("v2-blocked-source", () => {
    assert.deepEqual(resolveArtifacts([
      { artifactId: "a", source: "bad", checksum: "1", createdAt: "2026-01-01" },
      { artifactId: "a", source: "good", checksum: "2", createdAt: "2026-01-02" }
    ], { blockedSources: ["bad"] }), [
      { artifactId: "a", source: "good", checksum: "2" }
    ]);
  });
}

if (contractVersion >= 3) {
  check("v3-provenance-alias-and-priority", () => {
    assert.deepEqual(resolveArtifacts([
      { artifactId: "a", source: "edge", checksum: "edge", createdAt: "2026-01-01" },
      { artifactId: "a", source: "legacy-east", checksum: "east", createdAt: "2026-01-02" },
      { artifactId: "b", source: "unknown", checksum: "bad", createdAt: "2026-01-01" }
    ], {}), [
      { artifactId: "a", source: "prod-east", checksum: "east" }
    ]);
  });
  check("v3-state-priority-precedes-option-priority", () => {
    assert.deepEqual(resolveArtifacts([
      { artifactId: "a", source: "backup", checksum: "backup", createdAt: "2026-01-01" },
      { artifactId: "a", source: "edge", checksum: "edge", createdAt: "2026-01-02" }
    ], { sourcePriority: ["backup"] }), [
      { artifactId: "a", source: "prod-edge", checksum: "edge" }
    ]);
  });
}

const passed=checks.filter(x=>x.ok).length;
const failed=checks.length-passed;
const result={
  schemaVersion:1,
  contractVersion,
  passed,
  failed,
  correct:failed===0,
  evidenceRefs:failed===0 ? [`evidence:artifact-lineage-v${contractVersion}`] : [],
  checks
};
process.stdout.write(JSON.stringify(result,null,2)+"\n");
process.exit(result.correct?0:1);
