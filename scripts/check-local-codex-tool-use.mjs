import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  buildCodexLocalExecArgs
} from "../examples/adapters/codex-cli-args.mjs";

const model =
  process.argv[2] ||
  process.env.PLH_LOCAL_MODEL ||
  "qwen3.5:9b";
const provider =
  process.argv[3] ||
  process.env.PLH_LOCAL_PROVIDER ||
  "ollama";

const root = process.cwd();
const outDir = path.join(
  root,
  "results",
  "local",
  "tool-use-preflight",
  model.replace(/[^A-Za-z0-9._-]+/g, "_")
);
const workspace = path.join(outDir, "workspace");

await fs.rm(outDir, {
  recursive: true,
  force: true
});
await fs.mkdir(workspace, {
  recursive: true
});

const probePath = path.join(workspace, "PROBE.txt");
const expected = "PLH_TOOL_USE_OK\n";

const prompt = [
  "This is a tool-use preflight.",
  "You must actually modify the workspace using Codex tools.",
  "Create a file named PROBE.txt in the current workspace.",
  "Its exact contents must be one line: PLH_TOOL_USE_OK",
  "Then read the file back using a tool.",
  "Do not merely describe the command, patch, or tool call.",
  "Do not answer success unless the file exists."
].join("\n");

const args = buildCodexLocalExecArgs({
  prompt,
  model,
  localProvider: provider
});

const startedMs = Date.now();
const proc = spawnSync("codex", args, {
  cwd: workspace,
  encoding: "utf8",
  env: process.env,
  timeout: Number(
    process.env.PLH_PREFLIGHT_TIMEOUT_MS || 180000
  )
});
const durationMs = Date.now() - startedMs;

let actual = null;
try {
  actual = await fs.readFile(probePath, "utf8");
} catch {}

const stdout = String(proc.stdout || "");
const stderr = String(proc.stderr || "");
const textualToolMarkers = [
  "<tool_call>",
  "<tool_code",
  "exec(command=",
  "apply_patch",
  "tool_name",
  "function="
].filter((marker) =>
  stdout.includes(marker) || stderr.includes(marker)
);

const result = {
  schemaVersion: 1,
  model,
  provider,
  codexExitCode: proc.status,
  signal: proc.signal ?? null,
  durationMs,
  probeExists: actual != null,
  probeContentMatches: actual === expected,
  observedContent: actual,
  textualToolMarkers,
  passed:
    proc.status === 0 &&
    actual === expected,
  stdout,
  stderr
};

await fs.mkdir(outDir, {
  recursive: true
});
await fs.writeFile(
  path.join(outDir, "tool-use-preflight.json"),
  JSON.stringify(result, null, 2) + "\n"
);

process.stdout.write(
  JSON.stringify(
    {
      model: result.model,
      provider: result.provider,
      codexExitCode: result.codexExitCode,
      probeExists: result.probeExists,
      probeContentMatches:
        result.probeContentMatches,
      textualToolMarkers:
        result.textualToolMarkers,
      passed: result.passed,
      output:
        path.relative(
          root,
          path.join(
            outDir,
            "tool-use-preflight.json"
          )
        )
    },
    null,
    2
  ) + "\n"
);

process.exit(result.passed ? 0 : 1);
