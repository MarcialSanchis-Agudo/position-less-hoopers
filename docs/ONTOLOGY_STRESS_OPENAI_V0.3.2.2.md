# OpenAI Codex executor compatibility v0.3.2.2

No scientific cell has executed under the OpenAI executor yet.

Codex CLI 0.162.0 accepts `--sandbox workspace-write` on `codex exec`, but the `--ask-for-approval` CLI flag belongs to the interactive TUI rather than the noninteractive exec command. The noninteractive path accepts approval behavior through configuration.

The frozen adapter therefore invokes:

```text
codex exec
--ephemeral
--ignore-user-config
--ignore-rules
--skip-git-repo-check
--sandbox workspace-write
--model gpt-5.6-terra
-c approval_policy="never"
-c model_reasoning_effort="medium"
-c sandbox_workspace_write.network_access=false
<PROMPT>
```

This revision changes executor syntax only. TaskPacks, graders, ontology, role selection, worker profiles, context mappings, matcher weights, baseline order, and analysis hypotheses remain unchanged.
