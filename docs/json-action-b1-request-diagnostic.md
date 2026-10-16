# JSON-action B1 request diagnostic

This is development-only diagnostics, not another executor condition or a matrix resume.

The user-supplied v0.1.2 run at f2601deb6222c7fde1eb64d254a50a6001efe375 has two distinct results. B0 finished with no edit and green public tests but failed final external grading. B1 completed eleven actions, including successful public testing, then request twelve produced message content that JSON.parse rejected. No B1 write executed. Both cells had zero path rejections. B2, B3 and P were not run. Preserve B0 as an analyzable task failure and B1 as the frozen harness's infrastructure failure, not a final graded task failure.

The frozen loop retains only the first 1000 characters of invalid message content in its error. The cut-off excerpt therefore cannot establish provider generation truncation. Its raw response and done_reason are unavailable in the supplied evidence. Do not infer an Ollama version-specific bug, change the model, increase budgets, sanitize malformed code into an executable action, or silently retry the matrix from this observation.

## Diagnostic command

From this repository, use a new output directory:

```sh
node scripts/probe-json-action-failed-request.mjs \
  results/local/qwen35-9b-json-action-runtime-validation-v0.1.2-001 \
  results/local/qwen35-9b-json-b1-request-probe-001 \
  --send-once
```

Without --send-once the script is offline-only: it prepares request.json and B0's existing final summary, action paths and grading record without network calls. With the flag, it reads the local Ollama version and selected model metadata, then makes ONE /api/chat call. It reconstructs the failed request's application-level JSON body using the saved prompt, ordered action/result pairs, pinned settings, and hash-verified frozen source literals. A regression test compares reconstructed request bytes with bytes received from the unmodified production loop at a mock endpoint.

No emitted action is executed. No task file, checkpoint, old telemetry, test or grader is modified or rerun. No hidden grader feedback is included in the reconstructed model request. There are no parser retries and no native tools field. The response read is bounded by the original per-request timeout and a 2 MiB capture limit; a limit or transport error is reported explicitly with any bytes already received.

## Outputs and interpretation

- request.json: exact application body constructed for this new diagnostic request.
- response-body.raw: captured response bytes, including invalid JSON when present.
- message-content.txt: exact decoded message.content string when the envelope parses.
- environment-now.json: version and selected-model metadata observed now, not retroactive metadata for the old run.
- b0-review.json: saved B0 completion text, selected actions and existing final grade; not supplied to the model.
- probe-summary.json: parsing, HTTP/completion details, lengths, hashes and diagnostic counters.

A new valid response does not erase the original failure or validate the batch. A new malformed response supplies an inspectable reproduction, not proof of a unique root cause. Model weights were not digest-pinned in the original run; the current digest cannot prove it is unchanged. Full action-schema conformance and task correctness are not assessed by this transport diagnostic. Raw files should be retained even when the console preview is shorter.

Ollama's official API documentation describes format as accepting JSON or a JSON schema, and exposes done and done_reason on chat responses. Its structured-output examples validate message.content after generation. References: https://docs.ollama.com/api/chat and https://docs.ollama.com/capabilities/structured-outputs .
