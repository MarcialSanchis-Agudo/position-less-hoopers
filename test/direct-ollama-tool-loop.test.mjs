import {
  DEFAULT_OLLAMA_CHAT_TIMEOUT_MS,
  DEFAULT_OLLAMA_TOTAL_TIMEOUT_MS,
  isRetryableOllamaParserFailure
} from "../src/ollama-tool-loop.mjs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";

for (const relative of [
  "../src/ollama-tool-loop.mjs",
  "../examples/adapters/direct-ollama-tool-agent.mjs",
  "../scripts/check-direct-ollama-tool-use.mjs",
  "../scripts/check-direct-ollama-existing-file-edit.mjs"
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

test("direct Ollama adapter config is valid command-adapter shape", () => {
  const adapter = JSON.parse(
    fs.readFileSync(
      new URL(
        "../examples/adapters/direct-ollama-tools.json",
        import.meta.url
      ),
      "utf8"
    )
  );
  assert.equal(adapter.schemaVersion, 1);
  assert.equal(adapter.command, "node");
  assert.deepEqual(
    adapter.args,
    ["./direct-ollama-tool-agent.mjs"]
  );
});


test("Ollama Qwen parser EOF failures are retryable", () => {
  assert.equal(
    isRetryableOllamaParserFailure(
      500,
      '{"error":"XML syntax error on line 298: unexpected EOF"}'
    ),
    true
  );
  assert.equal(
    isRetryableOllamaParserFailure(
      500,
      '{"error":"EOF"}'
    ),
    true
  );
});

test("ordinary Ollama failures are not hidden by parser retries", () => {
  assert.equal(
    isRetryableOllamaParserFailure(
      500,
      '{"error":"model not found"}'
    ),
    false
  );
  assert.equal(
    isRetryableOllamaParserFailure(
      404,
      '{"error":"unexpected EOF"}'
    ),
    false
  );
});


test("direct Ollama time budgets are frozen below the outer adapter timeout", () => {
  const adapter = JSON.parse(
    fs.readFileSync(
      new URL(
        "../examples/adapters/direct-ollama-tools.json",
        import.meta.url
      ),
      "utf8"
    )
  );

  assert.equal(
    DEFAULT_OLLAMA_CHAT_TIMEOUT_MS,
    180000
  );
  assert.equal(
    DEFAULT_OLLAMA_TOTAL_TIMEOUT_MS,
    600000
  );
  assert.equal(adapter.timeoutMs, 780000);
  assert.ok(
    DEFAULT_OLLAMA_TOTAL_TIMEOUT_MS + 120000 <
      adapter.timeoutMs
  );
});
