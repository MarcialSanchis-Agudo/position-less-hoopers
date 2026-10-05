export function migrateConfig(input) {
  const output = { ...input };

  if ("retry_count" in output) {
    output.retry = {
      maxAttempts: output.retry_count
    };
    delete output.retry_count;
  }

  return output;
}

