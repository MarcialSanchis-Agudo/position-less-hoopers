import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const workspace = process.argv[2];
const contractVersion = Number(process.argv[3] ?? 2);

if (!workspace) {
  process.stderr.write(
    "usage: node grade.mjs <workspace> <contractVersion>\n"
  );
  process.exit(2);
}

const moduleUrl = pathToFileURL(
  path.resolve(workspace, "src/bridge.mjs")
).href;
const { normalizePartnerRecords } = await import(
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

if (contractVersion < 3) {
  check("v1-normalize", () => {
    assert.deepEqual(
      normalizePartnerRecords([
        { id: "b", value: 2 },
        { id: "a", value: "1" }
      ], {}),
      [
        { id: "a", value: "1" },
        { id: "b", value: "2" }
      ]
    );
  });
}

if (contractVersion === 2) {
  check("v2-blocked-and-last-wins", () => {
    assert.deepEqual(
      normalizePartnerRecords([
        { id: "a", value: "old" },
        { id: "a", value: "new" },
        { id: "b", value: "blocked" }
      ], { blockedIds: ["b"] }),
      [{ id: "a", value: "new" }]
    );
  });

  check("v2-default-value", () => {
    assert.deepEqual(
      normalizePartnerRecords(
        [{ id: "a", value: null }],
        { defaultValue: "fallback" }
      ),
      [{ id: "a", value: "fallback" }]
    );
  });
}

if (contractVersion >= 3) {
  check("v3-current-partner-schema", () => {
    assert.deepEqual(
      normalizePartnerRecords([
        { externalId: "b", amount: 2, state: "open" },
        { externalId: "a", amount: 1, state: "ready" },
        { externalId: "c", amount: 9, state: "closed" }
      ], {}),
      [
        { id: "a", value: "1" },
        { id: "b", value: "2" }
      ]
    );
  });

  check("v3-blocked-and-last-wins-after-mapping", () => {
    assert.deepEqual(
      normalizePartnerRecords([
        { externalId: "a", amount: 1, state: "open" },
        { externalId: "a", amount: 2, state: "ready" },
        { externalId: "b", amount: 3, state: "open" }
      ], { blockedIds: ["b"] }),
      [{ id: "a", value: "2" }]
    );
  });

  check("v3-default-after-schema-map", () => {
    assert.deepEqual(
      normalizePartnerRecords(
        [{ externalId: "a", amount: null, state: "open" }],
        { defaultValue: 7 }
      ),
      [{ id: "a", value: "7" }]
    );
  });

  check("v3-inactive-status-excluded", () => {
    assert.deepEqual(
      normalizePartnerRecords([
        { externalId: "a", amount: 1, state: "closed" },
        { externalId: "b", amount: 2, state: "open" }
      ], {}),
      [{ id: "b", value: "2" }]
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
    ? [`evidence:schema-bridge-v${contractVersion}`]
    : [],
  checks
};

process.stdout.write(JSON.stringify(result, null, 2) + "\n");
process.exit(result.correct ? 0 : 1);
