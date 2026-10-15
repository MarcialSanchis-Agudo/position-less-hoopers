import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";
import {
  OLLAMA_JSON_ACTION_SCHEMA
} from "../src/ollama-json-action-loop.mjs";

for (const relative of [
  "../src/ollama-json-action-loop.mjs",
  "../examples/adapters/direct-ollama-json-action-agent.mjs",
  "../scripts/check-direct-ollama-json-action-edit.mjs"
]) {
  test(`${relative} parses`, () => {
    const result = spawnSync(
      process.execPath,
      ["--check", new URL(relative, import.meta.url).pathname],
      { encoding: "utf8" }
    );

    assert.equal(
      result.status,
      0,
      result.stderr || result.stdout
    );
  });
}

test("structured action schema exposes host actions without native tool syntax", () => {
  const actions =
    OLLAMA_JSON_ACTION_SCHEMA
      .properties
      .action
      .enum;

  assert.deepEqual(actions, [
    "read_text_file",
    "list_directory",
    "write_text_file",
    "replace_line_range",
    "replace_text_in_file",
    "run_public_tests",
    "finish"
  ]);
});

test("structured JSON action adapter is bounded below command timeout", () => {
  const adapter = JSON.parse(
    fs.readFileSync(
      new URL(
        "../examples/adapters/direct-ollama-json-actions.json",
        import.meta.url
      ),
      "utf8"
    )
  );

  assert.equal(adapter.schemaVersion, 1);
  assert.equal(
    adapter.adapterId,
    "local-direct-ollama-json-actions"
  );
  assert.equal(adapter.timeoutMs, 660000);
});
