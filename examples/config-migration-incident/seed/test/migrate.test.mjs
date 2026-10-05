import assert from "node:assert/strict";
import test from "node:test";
import { migrateConfig } from "../src/migrate.mjs";

test("v1: migrates retry_count", () => {
  assert.deepEqual(migrateConfig({
    endpoint: "https://api.example",
    retry_count: 3
  }), {
    endpoint: "https://api.example",
    retry: { maxAttempts: 3 }
  });
});

