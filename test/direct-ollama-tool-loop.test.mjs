import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";

for (const relative of [
  "../src/ollama-tool-loop.mjs",
  "../examples/adapters/direct-ollama-tool-agent.mjs",
  "../scripts/check-direct-ollama-tool-use.mjs"
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
