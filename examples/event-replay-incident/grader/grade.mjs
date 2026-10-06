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
  path.resolve(workspace, "src/replay.mjs")
).href;
const { replayEvents } = await import(
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

check("v1-dedupe-and-order", () => {
  assert.deepEqual(
    replayEvents([
      { id: "b1", aggregateId: "b", sequence: 1, payload: {} },
      { id: "a2", aggregateId: "a", sequence: 2, payload: {} },
      { id: "a1", aggregateId: "a", sequence: 1, payload: {} },
      { id: "a1", aggregateId: "a", sequence: 1, payload: {} }
    ], {}),
    ["a1", "a2", "b1"]
  );
});

check("v1-input-not-mutated", () => {
  const events = [
    { id: "x2", aggregateId: "x", sequence: 2, payload: { n: 2 } },
    { id: "x1", aggregateId: "x", sequence: 1, payload: { n: 1 } }
  ];
  const before = structuredClone(events);
  replayEvents(events, {});
  assert.deepEqual(events, before);
});

if (contractVersion >= 2) {
  check("v2-min-sequence", () => {
    assert.deepEqual(
      replayEvents([
        { id: "a1", aggregateId: "a", sequence: 1, payload: {} },
        { id: "a2", aggregateId: "a", sequence: 2, payload: {} },
        { id: "b1", aggregateId: "b", sequence: 1, payload: {} }
      ], {
        minSequenceByAggregate: { a: 2 }
      }),
      ["a2", "b1"]
    );
  });

  check("v2-blocked-aggregate", () => {
    assert.deepEqual(
      replayEvents([
        { id: "a1", aggregateId: "a", sequence: 1, payload: {} },
        { id: "b1", aggregateId: "b", sequence: 1, payload: {} }
      ], {
        blockedAggregates: ["a"]
      }),
      ["b1"]
    );
  });

  check("v2-same-sequence-keeps-lexicographic-id", () => {
    assert.deepEqual(
      replayEvents([
        { id: "z", aggregateId: "a", sequence: 1, payload: {} },
        { id: "a", aggregateId: "a", sequence: 1, payload: {} },
        { id: "b", aggregateId: "a", sequence: 2, payload: {} }
      ], {}),
      ["a", "b"]
    );
  });

  check("v2-duplicate-id-precedes-sequence-conflict", () => {
    assert.deepEqual(
      replayEvents([
        { id: "same", aggregateId: "a", sequence: 2, payload: {} },
        { id: "same", aggregateId: "a", sequence: 1, payload: {} },
        { id: "other", aggregateId: "a", sequence: 2, payload: {} }
      ], {}),
      ["other"]
    );
  });
}

if (contractVersion >= 3) {
  check("v3-dependency-order", () => {
    assert.deepEqual(
      replayEvents([
        { id: "a2", aggregateId: "a", sequence: 2, payload: {} },
        { id: "a1", aggregateId: "a", sequence: 1, payload: {} },
        { id: "b1", aggregateId: "b", sequence: 1, payload: {} }
      ], {
        dependencies: {
          a2: ["b1"]
        }
      }),
      ["a1", "b1", "a2"]
    );
  });

  check("v3-missing-eligible-prerequisite-throws", () => {
    assert.throws(() =>
      replayEvents([
        { id: "a2", aggregateId: "a", sequence: 2, payload: {} }
      ], {
        dependencies: {
          a2: ["a1"]
        }
      })
    );
  });

  check("v3-blocked-prerequisite-throws", () => {
    assert.throws(() =>
      replayEvents([
        { id: "a1", aggregateId: "a", sequence: 1, payload: {} },
        { id: "b1", aggregateId: "b", sequence: 1, payload: {} }
      ], {
        blockedAggregates: ["a"],
        dependencies: {
          b1: ["a1"]
        }
      })
    );
  });

  check("v3-cycle-throws", () => {
    assert.throws(() =>
      replayEvents([
        { id: "a1", aggregateId: "a", sequence: 1, payload: {} },
        { id: "b1", aggregateId: "b", sequence: 1, payload: {} }
      ], {
        dependencies: {
          a1: ["b1"],
          b1: ["a1"]
        }
      })
    );
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
    ? [`evidence:event-replay-v${contractVersion}`]
    : [],
  checks
};

process.stdout.write(JSON.stringify(result, null, 2) + "\n");
process.exit(result.correct ? 0 : 1);

