import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCodexLocalExecArgs
} from "../examples/adapters/codex-cli-args.mjs";

test("local Codex/Ollama args pin provider and model without hosted config", () => {
  const args = buildCodexLocalExecArgs({
    prompt: "Reply only OK",
    model: "qwen3.5:4b",
    localProvider: "ollama"
  });

  assert.equal(args[0], "exec");
  assert.equal(args.includes("--oss"), true);
  assert.equal(args.includes("--local-provider"), true);
  assert.equal(
    args[args.indexOf("--local-provider") + 1],
    "ollama"
  );
  assert.equal(args.includes("--model"), true);
  assert.equal(
    args[args.indexOf("--model") + 1],
    "qwen3.5:4b"
  );
  assert.equal(args.includes("--ignore-user-config"), true);
  assert.equal(args.includes("--skip-git-repo-check"), true);
  assert.equal(args.includes("--sandbox"), true);
  assert.equal(
    args[args.indexOf("--sandbox") + 1],
    "workspace-write"
  );
  assert.equal(args.includes("--ask-for-approval"), false);
  assert.equal(args.includes("--full-auto"), false);

  const configs=[];
  for(let i=0;i<args.length-1;i+=1){
    if(args[i]==="-c") configs.push(args[i+1]);
  }
  assert.ok(configs.includes('approval_policy="never"'));
  assert.ok(
    configs.includes(
      "sandbox_workspace_write.network_access=false"
    )
  );
  assert.equal(args.at(-1), "Reply only OK");
});
