import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCodexExecArgs
} from "../examples/adapters/codex-cli-args.mjs";

test("Codex 0.162-compatible exec args avoid TUI-only approval flag", () => {
  const args = buildCodexExecArgs({
    prompt: "Reply only OK",
    model: "gpt-5.6-terra",
    effort: "medium"
  });

  assert.equal(args[0], "exec");
  assert.equal(args.includes("--full-auto"), false);
  assert.equal(args.includes("--ask-for-approval"), false);
  assert.equal(args.includes("--ephemeral"), true);
  assert.equal(args.includes("--ignore-user-config"), true);
  assert.equal(args.includes("--ignore-rules"), true);
  assert.equal(args.includes("--skip-git-repo-check"), true);

  const sandboxIndex = args.indexOf("--sandbox");
  assert.ok(sandboxIndex >= 0);
  assert.equal(args[sandboxIndex + 1], "workspace-write");

  const configValues = [];
  for (let i = 0; i < args.length - 1; i += 1) {
    if (args[i] === "-c") configValues.push(args[i + 1]);
  }

  assert.ok(configValues.includes('approval_policy="never"'));
  assert.ok(
    configValues.includes('model_reasoning_effort="medium"')
  );
  assert.ok(
    configValues.includes(
      "sandbox_workspace_write.network_access=false"
    )
  );

  assert.equal(args.at(-1), "Reply only OK");
});
