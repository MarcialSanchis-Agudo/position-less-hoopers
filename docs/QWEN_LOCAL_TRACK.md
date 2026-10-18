# Active local Qwen track; hosted research proceeds independently

Decision: 2026-10-18. This ChatGPT/Fluids continuation owns local Qwen/Ollama
executor investigation. Codex and its agents own the separate hosted PLH
research worktree/branches. Neither track is a prerequisite for the other.
Do not change hosted configurations or move main/frozen branches here.

## Evidence at the split

The user-supplied B1 request probe from diagnostic commit
7cb0626d2781e65a43bb7fd70413314ec266b6a6 reports Ollama 0.30.11,
qwen3.5:9b, one new request, HTTP 200, a complete JSON response envelope,
done=true, done_reason=stop, and syntactically invalid message.content.
No emitted action executed. No grader ran. This is a reproduction of the
failure class, not recovery of the original failed response.

Request SHA-256: 872f7fcc912802b61ad42a2407e6566fde4f0960124682c41a468ac708b363d0
Response SHA-256: 91beadad47c1de2f91b8d22e8ac73d408751d0b157c207d0c48ebaa873e4dee1
Model digest observed at that probe:
56671c2ab9385f9cfcb404638e32cd62d88e3501d44822208363c010179a3c90

B0 is a separate semantic stopping failure: its saved explanation acknowledged
unimplemented contract options but treated green public tests as sufficient.
Do not conflate that behavior with B1 serialization or repair both at once.
Full local probe files have not been independently retrieved by this chat.

## Source-backed hypothesis, not yet a verified local fix

Ollama's v0.30.11 rendered-chat source sets currentFormat=nil initially for
thinking-capable models with a built-in/generic thinking parser, except the
immediate Gemma4/think=false case. For the built-in parser, enforcement begins
only after both nonempty thinking and content appear. If Qwen takes this path
with thinking disabled, the transition may never happen. The user's actual
model renderer/parser selection has not been established from server logs.

Primary sources inspected on 2026-10-18:
- https://github.com/ollama/ollama/blob/v0.30.11/server/routes.go (rendered-chat structuredOutputsState block)
- https://github.com/ollama/ollama/issues/14645 (historical reports; closed status alone is not verification)
- https://docs.ollama.com/capabilities/structured-outputs

## Next diagnostic: one fixed-order thinking pair, no actions

    node scripts/probe-qwen-thinking-pair.mjs \
      results/local/qwen35-9b-json-b1-request-probe-001 \
      results/local/qwen35-9b-json-thinking-pair-001 \
      --send-pair

Without --send-pair the script prepares request files offline and makes no
network requests. With it, at most TWO inference requests are made: first
think=false (saved request bytes unchanged), then think=true. Messages, model,
schema, temperature, context setting and all other body fields stay identical.
The second response is not appended to a solver conversation. Both conditions
retain the 120000ms request cap and 2MiB capture limit. No automatic retries,
JSON repair, file edits, public tests, hidden graders, or matrix continuation.

The script checks the current server version and model-tag digest against the
saved probe before inference, between conditions, and after the pair. A mismatch
or unavailable metadata stops the diagnostic; it never upgrades Ollama or pulls
weights. Digest equality is against the earlier PROBE, not retroactive model
provenance for the original matrix. Changes between metadata snapshots cannot
be ruled out. HTTP/transport failure stops before another inference is submitted.

An unused output directory inside this repository is required, outside the
previous probe and original batch directories. Every condition gets its request,
raw response and decoded message.content. The incremental summary is
thinking-pair-summary.json. Its request counter is persisted before each send.

## Interpretation boundary

- only_think_true_schema_valid: supports thinking-dependent behavior for this
  request; it does not by itself prove the exact serving bug or establish a fix.
- both_schema_valid: the previous failure was not reproduced in this pair.
- neither_schema_valid / only_think_false_schema_valid: thinking alone is not
  the demonstrated remedy under these limits.
- inconclusive: incomplete/length-limited response, metadata mismatch, HTTP error
  or other incomplete pair. Do not increase budgets automatically.

This is n=1 per condition in fixed order, not a reliability estimate or a causal
benchmark. Thinking changes model generation as well as potential server grammar
activation; compliant output alone cannot prove constraint enforcement. A small
schema-conflict sentinel or server trace would be needed for that narrower claim.
Full validation is implemented only for the exact existing action JSON schema.
That schema permits missing edit arguments and extra properties: passing it
is NOT proof of tool validity, safe editing, task correctness or PLH success.

The frozen runtime, prompt helper, filesystem permissions, budgets, taskpacks,
graders and historical reports remain unchanged. B0's stopping behavior is next
only after the serialization boundary is characterized. Hosted research may
proceed meanwhile without waiting for this local track.
