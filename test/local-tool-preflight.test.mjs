import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("local Codex tool-use preflight parses", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--check",
      new URL(
        "../scripts/check-local-codex-tool-use.mjs",
        import.meta.url
      ).pathname
    ],
    { encoding: "utf8" }
  );

  assert.equal(
    result.status,
    0,
    result.stderr || result.stdout
  );
});
