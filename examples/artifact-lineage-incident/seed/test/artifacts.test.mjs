import assert from "node:assert/strict";
import test from "node:test";
import { resolveArtifacts } from "../src/artifacts.mjs";

test("v1: resolves duplicates deterministically", () => {
  const records = [
    { artifactId: "b", source: "z", checksum: "2", createdAt: "2026-01-02" },
    { artifactId: "a", source: "y", checksum: "old", createdAt: "2026-01-02" },
    { artifactId: "a", source: "x", checksum: "new", createdAt: "2026-01-01" }
  ];

  assert.deepEqual(resolveArtifacts(records), [
    { artifactId: "a", source: "x", checksum: "new" },
    { artifactId: "b", source: "z", checksum: "2" }
  ]);
});
