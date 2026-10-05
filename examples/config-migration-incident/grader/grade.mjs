import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const workspace = process.argv[2];
const contractVersion = Number(process.argv[3] ?? 2);

if (!workspace) {
  process.stderr.write("usage: node grade.mjs <workspace> <contractVersion>\n");
  process.exit(2);
}

const moduleUrl = pathToFileURL(path.resolve(workspace, "src/migrate.mjs")).href;
const { migrateConfig } = await import(moduleUrl + `?grader=${Date.now()}`);

const checks = [];

function check(name, fn) {
  try {
    fn();
    checks.push({ name, ok: true });
  } catch (error) {
    checks.push({
      name,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

check("v1-retry-count", () => {
  assert.deepEqual(migrateConfig({
    endpoint: "https://api.example",
    retry_count: 3
  }), {
    endpoint: "https://api.example",
    retry: { maxAttempts: 3 }
  });
});

check("v1-preserves-unrelated", () => {
  assert.deepEqual(migrateConfig({
    retry_count: 2,
    featureFlag: true
  }), {
    retry: { maxAttempts: 2 },
    featureFlag: true
  });
});

if (contractVersion >= 2) {
  check("v2-timeout-ms", () => {
    assert.deepEqual(migrateConfig({
      timeout_ms: 1200
    }), {
      network: { timeoutMs: 1200 }
    });
  });

  check("v2-merges-existing-retry-network", () => {
    assert.deepEqual(migrateConfig({
      retry_count: 4,
      timeout_ms: 900,
      retry: { strategy: "exponential" },
      network: { keepAlive: true },
      untouched: "yes"
    }), {
      retry: {
        strategy: "exponential",
        maxAttempts: 4
      },
      network: {
        keepAlive: true,
        timeoutMs: 900
      },
      untouched: "yes"
    });
  });

  check("v2-removes-deprecated-flat-keys", () => {
    const output = migrateConfig({
      retry_count: 1,
      timeout_ms: 500
    });
    assert.equal("retry_count" in output, false);
    assert.equal("timeout_ms" in output, false);
  });
}

if (contractVersion >= 3) {
  check("v3-backoff-ms", () => {
    assert.deepEqual(migrateConfig({
      backoff_ms: 250
    }), {
      retry: { backoffMs: 250 }
    });
  });

  check("v3-circuit-breaker", () => {
    assert.deepEqual(migrateConfig({
      circuit_breaker: {
        enabled: true,
        failureThreshold: 5
      }
    }), {
      resilience: {
        circuitBreaker: {
          enabled: true,
          failureThreshold: 5
        }
      }
    });
  });

  check("v3-merges-all-nested-objects", () => {
    assert.deepEqual(migrateConfig({
      retry_count: 5,
      backoff_ms: 300,
      timeout_ms: 1500,
      circuit_breaker: { enabled: true },
      retry: { strategy: "linear" },
      network: { dnsCache: true },
      resilience: { fallback: "cached" },
      extra: 42
    }), {
      retry: {
        strategy: "linear",
        maxAttempts: 5,
        backoffMs: 300
      },
      network: {
        dnsCache: true,
        timeoutMs: 1500
      },
      resilience: {
        fallback: "cached",
        circuitBreaker: { enabled: true }
      },
      extra: 42
    });
  });
}

const passed = checks.filter((item) => item.ok).length;
const failed = checks.length - passed;
const result = {
  schemaVersion: 1,
  contractVersion,
  passed,
  failed,
  correct: failed === 0,
  evidenceRefs: failed === 0
    ? [`evidence:config-migration-v${contractVersion}`]
    : [],
  checks
};

process.stdout.write(JSON.stringify(result, null, 2) + "\n");
process.exit(result.correct ? 0 : 1);

