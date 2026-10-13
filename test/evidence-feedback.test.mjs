import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import {
  deriveEvidenceFeedback,
  renderEvidenceFeedback
} from "../src/evidence-feedback.mjs";

const feedbackConfig = JSON.parse(
  fs.readFileSync(
    new URL(
      "../benchmarks/courtshift/local-evidence-feedback-v0.1.json",
      import.meta.url
    ),
    "utf8"
  )
);

test("evidence feedback maps failed checks to frozen context requirements", () => {
  const feedback = deriveEvidenceFeedback({
    graderChecks: [
      { name: "v3-current-partner-schema", ok: false },
      { name: "v3-default-after-schema-map", ok: false }
    ],
    feedbackConfig
  });

  assert.equal(feedback.satisfied, false);
  assert.deepEqual(
    feedback.stateRequirements.contextRefs,
    ["external_signal", "schema_history"]
  );
  assert.deepEqual(
    feedback.stateRequirements.capabilities,
    ["diagnose", "implement", "reconcile"]
  );
});

test("evidence feedback rejects unmapped hidden checks", () => {
  assert.throws(
    () =>
      deriveEvidenceFeedback({
        graderChecks: [
          { name: "unfrozen-hidden-check", ok: false }
        ],
        feedbackConfig
      }),
    /No frozen evidence-feedback mapping/
  );
});

test("rendered feedback exposes obligation semantics but not grader diffs", () => {
  const feedback = deriveEvidenceFeedback({
    graderChecks: [
      {
        name: "v2-source-priority",
        ok: false,
        error: "SECRET EXPECTED OUTPUT"
      }
    ],
    feedbackConfig
  });

  const rendered = renderEvidenceFeedback(feedback, {
    attemptNumber: 1
  });

  assert.match(rendered, /artifact\.v2\.source_priority/);
  assert.match(rendered, /Public test success is not sufficient/);
  assert.doesNotMatch(rendered, /SECRET EXPECTED OUTPUT/);
});
