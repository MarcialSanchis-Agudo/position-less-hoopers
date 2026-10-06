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
  path.resolve(workspace, "src/access.mjs")
).href;
const { planAccessChanges } = await import(
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

check("v1-basic-reconcile", () => {
  assert.deepEqual(
    planAccessChanges(
      { bob: ["write", "read"], alice: ["read"] },
      { alice: ["read", "write"], bob: ["read"], carol: ["audit"] },
      {}
    ),
    [
      { principal: "alice", add: ["write"], remove: [] },
      { principal: "bob", add: [], remove: ["write"] },
      { principal: "carol", add: ["audit"], remove: [] }
    ]
  );
});

check("v1-dedupe-sort-and-no-op", () => {
  assert.deepEqual(
    planAccessChanges(
      { a: ["read", "read"], b: [] },
      { a: ["read"], b: ["write", "audit", "write"] },
      {}
    ),
    [
      { principal: "b", add: ["audit", "write"], remove: [] }
    ]
  );
});

if (contractVersion >= 2) {
  check("v2-protected-principal-no-removal", () => {
    assert.deepEqual(
      planAccessChanges(
        { root: ["admin", "read"] },
        { root: ["read"] },
        { protectedPrincipals: ["root"] }
      ),
      []
    );
  });

  check("v2-protected-principal-can-add", () => {
    assert.deepEqual(
      planAccessChanges(
        { root: ["read"] },
        { root: ["read", "audit"] },
        { protectedPrincipals: ["root"] }
      ),
      [
        { principal: "root", add: ["audit"], remove: [] }
      ]
    );
  });

  check("v2-required-permissions-merge", () => {
    assert.deepEqual(
      planAccessChanges(
        { svc: ["read"] },
        { svc: ["read"] },
        { requiredPermissions: { svc: ["audit", "write"] } }
      ),
      [
        { principal: "svc", add: ["audit", "write"], remove: [] }
      ]
    );
  });

  check("v2-required-only-principal", () => {
    assert.deepEqual(
      planAccessChanges(
        {},
        {},
        { requiredPermissions: { auditor: ["audit"] } }
      ),
      [
        { principal: "auditor", add: ["audit"], remove: [] }
      ]
    );
  });
}

if (contractVersion >= 3) {
  check("v3-locked-permission-never-removed", () => {
    assert.deepEqual(
      planAccessChanges(
        { svc: ["read", "breakglass"] },
        { svc: ["read"] },
        { lockedPermissions: ["breakglass"] }
      ),
      []
    );
  });

  check("v3-exclusive-group-conflict", () => {
    assert.throws(() =>
      planAccessChanges(
        {},
        { user: ["approve", "request"] },
        { exclusivePermissionGroups: [["approve", "request"]] }
      )
    );
  });

  check("v3-required-can-create-exclusive-conflict", () => {
    assert.throws(() =>
      planAccessChanges(
        {},
        { user: ["request"] },
        {
          requiredPermissions: { user: ["approve"] },
          exclusivePermissionGroups: [["approve", "request"]]
        }
      )
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
    ? [`evidence:access-policy-v${contractVersion}`]
    : [],
  checks
};

process.stdout.write(JSON.stringify(result, null, 2) + "\n");
process.exit(result.correct ? 0 : 1);

