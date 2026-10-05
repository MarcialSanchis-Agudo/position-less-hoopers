const OUTCOMES = new Set(["success", "failure", "incomplete", "excluded"]);
const RUN_KINDS = new Set(["clean", "perturbed"]);

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isoDate(value) {
  return nonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function arrayOfStrings(value) {
  return Array.isArray(value) && value.every(nonEmptyString);
}

export function validateExperimentRunManifest(manifest) {
  const errors = [];

  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return { ok: false, errors: ["manifest must be an object"] };
  }

  if (manifest.schemaVersion !== 1) errors.push("schemaVersion must equal 1");

  for (const key of ["experimentId", "conditionId", "taskId", "taskVersion", "codeVersion", "configHash"]) {
    if (!nonEmptyString(manifest[key])) errors.push(`${key} must be a non-empty string`);
  }

  if (!RUN_KINDS.has(manifest.runKind)) {
    errors.push("runKind must be clean or perturbed");
  }

  if (manifest.runKind === "perturbed" && !nonEmptyString(manifest.perturbationId)) {
    errors.push("perturbationId is required for perturbed runs");
  }

  if (manifest.perturbationId != null && !nonEmptyString(manifest.perturbationId)) {
    errors.push("perturbationId must be a non-empty string when present");
  }

  if (manifest.perturbationSeed != null && !Number.isInteger(manifest.perturbationSeed)) {
    errors.push("perturbationSeed must be an integer when present");
  }

  if (!arrayOfStrings(manifest.modelPool)) {
    errors.push("modelPool must be an array of non-empty strings");
  }

  if (!isoDate(manifest.startedAt)) errors.push("startedAt must be an ISO-compatible timestamp");
  if (!isoDate(manifest.finishedAt)) errors.push("finishedAt must be an ISO-compatible timestamp");

  if (isoDate(manifest.startedAt) && isoDate(manifest.finishedAt) &&
      Date.parse(manifest.finishedAt) < Date.parse(manifest.startedAt)) {
    errors.push("finishedAt must not precede startedAt");
  }

  if (!OUTCOMES.has(manifest.finalOutcome)) {
    errors.push("finalOutcome must be success, failure, incomplete, or excluded");
  }

  if (!nonEmptyString(manifest.graderVersion)) {
    errors.push("graderVersion must be a non-empty string");
  }

  if (!nonEmptyString(manifest.eventTraceRef)) {
    errors.push("eventTraceRef must be a non-empty string");
  }

  if (manifest.artifactRefs != null && !arrayOfStrings(manifest.artifactRefs)) {
    errors.push("artifactRefs must be an array of non-empty strings when present");
  }

  if (manifest.exclusionReason != null && !nonEmptyString(manifest.exclusionReason)) {
    errors.push("exclusionReason must be a non-empty string when present");
  }

  if (manifest.finalOutcome === "excluded" && !nonEmptyString(manifest.exclusionReason)) {
    errors.push("exclusionReason is required when finalOutcome is excluded");
  }

  if (manifest.costUsd != null && (!Number.isFinite(manifest.costUsd) || manifest.costUsd < 0)) {
    errors.push("costUsd must be a non-negative finite number when present");
  }

  if (manifest.concurrencyCap != null && (!Number.isInteger(manifest.concurrencyCap) || manifest.concurrencyCap < 1)) {
    errors.push("concurrencyCap must be a positive integer when present");
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

export function assertExperimentRunManifest(manifest) {
  const result = validateExperimentRunManifest(manifest);
  if (!result.ok) {
    throw new TypeError(`Invalid ExperimentRun manifest: ${result.errors.join("; ")}`);
  }
  return manifest;
}

