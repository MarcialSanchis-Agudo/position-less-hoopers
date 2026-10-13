function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function sortedUnique(values = []) {
  return [...new Set(
    values.filter(nonEmptyString).map((value) => value.trim())
  )].sort((a, b) => a.localeCompare(b));
}

export function deriveEvidenceFeedback({
  graderChecks,
  feedbackConfig
}) {
  if (!Array.isArray(graderChecks)) {
    throw new TypeError("graderChecks must be an array");
  }
  if (
    !feedbackConfig ||
    typeof feedbackConfig !== "object" ||
    Array.isArray(feedbackConfig)
  ) {
    throw new TypeError("feedbackConfig must be an object");
  }

  const failedChecks = graderChecks.filter(
    (check) => check?.ok !== true
  );

  if (failedChecks.length === 0) {
    return {
      schemaVersion: 1,
      satisfied: true,
      obligations: [],
      stateRequirements: {
        capabilities: [],
        contextRefs: []
      }
    };
  }

  const obligations = failedChecks.map((check) => {
    const name = String(check?.name ?? "");
    const mapped = feedbackConfig.checks?.[name];
    if (!mapped) {
      throw new TypeError(
        `No frozen evidence-feedback mapping for grader check ${name}`
      );
    }

    return {
      checkName: name,
      obligationId: mapped.obligationId,
      description: mapped.description,
      capabilities: sortedUnique(mapped.capabilities),
      contextRefs: sortedUnique(mapped.contextRefs)
    };
  });

  return {
    schemaVersion: 1,
    satisfied: false,
    obligations,
    stateRequirements: {
      capabilities: sortedUnique(
        obligations.flatMap((item) => item.capabilities)
      ),
      contextRefs: sortedUnique(
        obligations.flatMap((item) => item.contextRefs)
      )
    }
  };
}

export function renderEvidenceFeedback(feedback, {
  attemptNumber
} = {}) {
  if (!feedback || feedback.satisfied === true) {
    return [
      "# Authoritative Evidence Feedback",
      "",
      "All frozen evidence obligations are satisfied."
    ].join("\n") + "\n";
  }

  const attemptLine = Number.isInteger(attemptNumber)
    ? `Attempt ${attemptNumber} did not satisfy authoritative evidence.`
    : "The previous attempt did not satisfy authoritative evidence.";

  return [
    "# Authoritative Evidence Feedback",
    "",
    attemptLine,
    "",
    "Public test success is not sufficient evidence of completion.",
    "The following frozen obligations remain unsatisfied:",
    "",
    ...feedback.obligations.flatMap((item) => [
      `- ${item.obligationId}: ${item.description}`
    ]),
    "",
    "Re-inspect the active contract and authoritative state relevant to these obligations.",
    "Do not inspect grader source or hidden tests.",
    "Do not invent evidence."
  ].join("\n") + "\n";
}
