import assert from "node:assert/strict";
import test from "node:test";
import { canCommit } from "../src/commit.mjs";

test("matching observed version can commit when approved", () => {
  assert.equal(canCommit(
    { approved: true, workspaceVersionSeen: "v2" },
    { workspaceVersion: "v2" }
  ), true);
});

test("stale version cannot commit", () => {
  assert.equal(canCommit(
    { approved: true, workspaceVersionSeen: "v1" },
    { workspaceVersion: "v2" }
  ), false);
});

test("missing observed version cannot commit", () => {
  assert.equal(canCommit(
    { approved: true, workspaceVersionSeen: null },
    { workspaceVersion: "v2" }
  ), false);
});

test("approval remains required", () => {
  assert.equal(canCommit(
    { approved: false, workspaceVersionSeen: "v2" },
    { workspaceVersion: "v2" }
  ), false);
});

