# OpenAI Codex / ChatGPT executor for v0.3.2

This executor-portability revision preserves the v0.3 ontology-stress scientific design and changes only the command-agent provider.

The adapter is:

`examples/adapters/codex-chatgpt.json`

It invokes Codex CLI in non-interactive full-auto mode, with an ephemeral fresh session for every cell. Authentication is expected to come from a local **Sign in with ChatGPT** Codex session; no OpenAI API key is required by the adapter.

Frozen requested settings:

- model: `gpt-5.6-terra`;
- reasoning effort: `medium`;
- fresh session per cell;
- workspace-write Codex sandbox through `--full-auto`;
- no network use requested in the experimental prompt;
- public `npm test` run after every Codex invocation;
- external TaskPack grader remains authoritative.

OpenAI/Codex results are a separate executor-family replication. They must not be pooled with Claude results.

Before starting a real matrix, verify the local CLI:

```bash
codex --version
codex exec --ephemeral --model gpt-5.6-terra -c 'model_reasoning_effort="medium"' "Reply only OK"
```


## v0.3.2.1 CLI compatibility repair

The first OpenAI attempt stopped before scientific cell 0 because Codex CLI 0.162.0 rejected the legacy `--full-auto` flag on `codex exec`.

No scientific cells were observed.

The adapter now uses the explicit current automation flags:

```text
--sandbox workspace-write
--ask-for-approval never
--skip-git-repo-check
--ignore-user-config
--ignore-rules
```

It also sets `sandbox_workspace_write.network_access=false`.

This is an executor-syntax/isolation revision only; the ontology-stress scientific design is unchanged.
