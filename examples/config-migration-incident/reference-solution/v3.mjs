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
  if ("backoff_ms" in output) {
    output.retry = { ...(output.retry ?? {}), backoffMs: output.backoff_ms };
    delete output.backoff_ms;
  }
  if ("circuit_breaker" in output) {
    output.resilience = { ...(output.resilience ?? {}), circuitBreaker: output.circuit_breaker };
    delete output.circuit_breaker;
  }

  return output;
}

