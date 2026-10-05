export function migrateConfig(input) {
  const output = { ...input };

  if ("retry_count" in output) {
    output.retry = { ...(output.retry ?? {}), maxAttempts: output.retry_count };
    delete output.retry_count;
  }

  if ("timeout_ms" in output) {
    output.network = { ...(output.network ?? {}), timeoutMs: output.timeout_ms };
    delete output.timeout_ms;
  }

  return output;
}

