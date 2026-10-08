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
