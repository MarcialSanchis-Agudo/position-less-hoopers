export function buildCodexExecArgs({
  prompt,
  model = "gpt-5.6-terra",
  effort = "medium"
} = {}) {
  if (typeof prompt !== "string" || prompt.length === 0) {
    throw new TypeError("prompt must be a non-empty string");
  }

  const args = [
    "exec",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--skip-git-repo-check",
    "--sandbox",
    "workspace-write"
  ];

  if (model) {
    args.push("--model", model);
  }

  args.push(
    "-c",
    'approval_policy="never"'
  );

  if (effort) {
    args.push(
      "-c",
      `model_reasoning_effort="${effort}"`
    );
  }

  args.push(
    "-c",
    "sandbox_workspace_write.network_access=false"
  );

  args.push(prompt);

  return args;
}
