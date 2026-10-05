import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const workspace = process.argv[2];
const contractVersion = Number(process.argv[3] ?? 2);

if (!workspace) {
  process.stderr.write("usage: node grade.mjs <workspace> <contractVersion>\n");
  process.exit(2);
}

const moduleUrl = pathToFileURL(
  path.resolve(workspace, "src/rollout.mjs")
).href;
const { planRollout } = await import(
  moduleUrl + `?grader=${Date.now()}`
);

const checks = [];

function check(name, fn) {
  try {
    fn();
    checks.push({ name, ok: true });
  } catch (error) {
    checks.push({
      name,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function flatten(batches) {
  return batches.flat();
}

check("v1-health-and-batch-size", () => {
  assert.deepEqual(
    planRollout([
      { id: "a", zone: "z1", healthy: true },
      { id: "b", zone: "z2", healthy: false },
      { id: "c", zone: "z3", healthy: true },
      { id: "d", zone: "z4", healthy: true }
    ], { maxBatchSize: 2 }),
    [["a", "c"], ["d"]]
  );
});

check("v1-stable-order", () => {
  assert.deepEqual(
    planRollout([
      { id: "n3", zone: "z1" },
      { id: "n1", zone: "z2" },
      { id: "n2", zone: "z3" }
    ], { maxBatchSize: 2 }),
    [["n3", "n1"], ["n2"]]
  );
});

if (contractVersion >= 2) {
  check("v2-blocked-zones", () => {
    assert.deepEqual(
      planRollout([
        { id: "a", zone: "z1" },
        { id: "b", zone: "z2" },
        { id: "c", zone: "z3" }
      ], {
        maxBatchSize: 2,
        blockedZones: ["z2"]
      }),
      [["a", "c"]]
    );
  });

  check("v2-canary-alone-first", () => {
    assert.deepEqual(
      planRollout([
        { id: "a", zone: "z1" },
        { id: "b", zone: "z2" },
        { id: "c", zone: "z3" }
      ], {
        maxBatchSize: 2,
        canaryNodeId: "b"
      }),
      [["b"], ["a", "c"]]
    );
  });

  check("v2-zone-diversity-after-canary", () => {
    const batches = planRollout([
      { id: "a", zone: "z1" },
      { id: "b", zone: "z1" },
      { id: "c", zone: "z2" },
      { id: "d", zone: "z3" }
    ], {
      maxBatchSize: 3,
      canaryNodeId: "d"
    });

    assert.deepEqual(batches[0], ["d"]);

    for (const batch of batches.slice(1)) {
      const zones = batch.map((id) => ({
        a: "z1",
        b: "z1",
        c: "z2",
        d: "z3"
      })[id]);
      assert.equal(new Set(zones).size, zones.length);
    }
    assert.deepEqual(flatten(batches).sort(), ["a","b","c","d"]);
  });

  check("v2-blocked-canary-does-not-reappear", () => {
    assert.deepEqual(
      planRollout([
        { id: "a", zone: "z1" },
        { id: "b", zone: "z2" },
        { id: "c", zone: "z3" }
      ], {
        maxBatchSize: 2,
        blockedZones: ["z2"],
        canaryNodeId: "b"
      }),
      [["a", "c"]]
    );
  });
}

if (contractVersion >= 3) {
  check("v3-maintenance-excluded", () => {
    assert.deepEqual(
      planRollout([
        { id: "a", zone: "z1" },
        { id: "b", zone: "z2", maintenance: true },
        { id: "c", zone: "z3" }
      ], { maxBatchSize: 2 }),
      [["a", "c"]]
    );
  });

  check("v3-dependency-order", () => {
    const batches = planRollout([
      { id: "api", zone: "z1", dependsOn: ["db"] },
      { id: "db", zone: "z2" },
      { id: "worker", zone: "z3", dependsOn: ["api"] }
    ], { maxBatchSize: 2 });

    const batchIndex = Object.fromEntries(
      batches.flatMap((batch, index) =>
        batch.map((id) => [id, index])
      )
    );
    assert.ok(batchIndex.db < batchIndex.api);
    assert.ok(batchIndex.api < batchIndex.worker);
  });

  check("v3-max-batch-weight", () => {
    const batches = planRollout([
      { id: "a", zone: "z1", weight: 2 },
      { id: "b", zone: "z2", weight: 2 },
      { id: "c", zone: "z3", weight: 1 }
    ], {
      maxBatchSize: 3,
      maxBatchWeight: 3
    });

    const weights = { a: 2, b: 2, c: 1 };
    for (const batch of batches) {
      const total = batch.reduce(
        (sum, id) => sum + weights[id],
        0
      );
      assert.ok(total <= 3);
    }
    assert.deepEqual(flatten(batches).sort(), ["a","b","c"]);
  });

  check("v3-unresolvable-dependency-throws", () => {
    assert.throws(() => planRollout([
      { id: "a", zone: "z1", dependsOn: ["b"] },
      { id: "b", zone: "z2", dependsOn: ["a"] }
    ], { maxBatchSize: 2 }));
  });
}

const passed = checks.filter((item) => item.ok).length;
const failed = checks.length - passed;

const result = {
  schemaVersion: 1,
  contractVersion,
  passed,
  failed,
  correct: failed === 0,
  evidenceRefs: failed === 0
    ? [`evidence:deployment-rollout-v${contractVersion}`]
    : [],
  checks
};

process.stdout.write(JSON.stringify(result, null, 2) + "\n");
process.exit(result.correct ? 0 : 1);

