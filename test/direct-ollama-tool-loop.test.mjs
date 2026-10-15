import {
  DEFAULT_OLLAMA_CHAT_TIMEOUT_MS,
  DEFAULT_OLLAMA_TOTAL_TIMEOUT_MS,
  executeOllamaWorkspaceTool,
  isRetryableOllamaParserFailure
} from "../src/ollama-tool-loop.mjs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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


test("existing files reject full overwrite and accept bounded line-range edits", async () => {
  const workspace = await fsp.mkdtemp(
    path.join(os.tmpdir(), "plh-ollama-tools-")
  );

  try {
    await fsp.mkdir(
      path.join(workspace, "src"),
      { recursive: true }
    );
    await fsp.writeFile(
      path.join(workspace, "src/value.mjs"),
      [
        "export function value() {",
        "  return 1;",
        "}",
        ""
      ].join("\n"),
      "utf8"
    );

    await assert.rejects(
      executeOllamaWorkspaceTool(workspace, {
        function: {
          name: "write_text_file",
          arguments: {
            path: "src/value.mjs",
            content: "truncated"
          }
        }
      }),
      /file already exists/
    );

    await executeOllamaWorkspaceTool(workspace, {
      function: {
        name: "replace_line_range",
        arguments: {
          path: "src/value.mjs",
          startLine: 2,
          endLine: 2,
          newText: "  return 2;"
        }
      }
    });

    assert.equal(
      await fsp.readFile(
        path.join(workspace, "src/value.mjs"),
        "utf8"
      ),
      [
        "export function value() {",
        "  return 2;",
        "}",
        ""
      ].join("\n")
    );
  } finally {
    await fsp.rm(workspace, {
      recursive: true,
      force: true
    });
  }
});
