import fs from "node:fs/promises";
import path from "node:path";
import { runOllamaWorkspaceAgent } from "../src/ollama-tool-loop.mjs";

const model = process.argv[2] || "qwen3.5:9b";
const root = process.cwd();
const outDir = path.join(
  root,
  "results/local/direct-ollama-tool-preflight",
  model.replace(/[^A-Za-z0-9._-]+/g, "_")
);
const workspace = path.join(outDir, "workspace");

await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(workspace, { recursive: true });

let agent;
let error = null;
try {
  agent = await runOllamaWorkspaceAgent({
    model,
    workspace,
    maxTurns: 8,
    numCtx: 32768,
    prompt:
      "Create PROBE.txt with exact content PLH_TOOL_USE_OK, then read it back using the provided workspace tools."
  });
} catch (caught) {
  error = caught instanceof Error ? caught.message : String(caught);
  agent = {
    completed: false,
    toolCallCount: 0,
    writeToolCallCount: 0,
    transcript: []
  };
}

let observedContent = null;
try {
  observedContent = await fs.readFile(
    path.join(workspace, "PROBE.txt"),
    "utf8"
  );
} catch {}

const passed =
  error == null &&
  agent.completed === true &&
  agent.writeToolCallCount >= 1 &&
  observedContent?.trim() === "PLH_TOOL_USE_OK";

const result = {
  schemaVersion: 1,
  runtime: "direct-ollama-api-tool-loop",
  model,
  agentCompleted: agent.completed,
  toolCallCount: agent.toolCallCount,
  writeToolCallCount: agent.writeToolCallCount,
  probeExists: observedContent != null,
  probeContentMatches:
    observedContent?.trim() === "PLH_TOOL_USE_OK",
  observedContent,
  error,
  passed,
  transcript: agent.transcript
};

await fs.writeFile(
  path.join(outDir, "direct-ollama-tool-preflight.json"),
  JSON.stringify(result, null, 2) + "\n"
);

console.log(JSON.stringify({
  model,
  toolCallCount: result.toolCallCount,
  writeToolCallCount: result.writeToolCallCount,
  probeExists: result.probeExists,
  probeContentMatches: result.probeContentMatches,
  passed
}, null, 2));

process.exit(passed ? 0 : 1);
