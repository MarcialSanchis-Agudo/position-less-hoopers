function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function sortedUnique(values = []) {
  return [...new Set(values.filter(nonEmptyString).map((v) => v.trim()))]
    .sort((a, b) => a.localeCompare(b));
}

export function validateTaskPackManifest(manifest) {
  const errors = [];

  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return { ok: false, errors: ["manifest must be an object"] };
  }

  if (manifest.schemaVersion !== 1) errors.push("schemaVersion must equal 1");

  for (const key of ["taskPackId", "version", "seedPath", "activeContractPath"]) {
    if (!nonEmptyString(manifest[key])) {
      errors.push(`${key} must be a non-empty string`);
    }
  }

  if (!manifest.grader || typeof manifest.grader !== "object") {
    errors.push("grader must be an object");
  } else if (!nonEmptyString(manifest.grader.path)) {
    errors.push("grader.path must be a non-empty string");
  }

  if (!nonEmptyString(manifest.evidenceRefTemplate)) {
    errors.push("evidenceRefTemplate must be a non-empty string");
  } else if (!manifest.evidenceRefTemplate.includes("{version}")) {
    errors.push("evidenceRefTemplate must include {version}");
  }

  if (!manifest.contracts || typeof manifest.contracts !== "object") {
    errors.push("contracts must be an object");
  } else {
    const versions = Object.keys(manifest.contracts);
    if (versions.length === 0) errors.push("contracts must not be empty");
    for (const version of versions) {
      if (!nonEmptyString(manifest.contracts[version])) {
        errors.push(`contracts.${version} must be a non-empty string`);
      }
    }
  }

  if (!Array.isArray(manifest.scenarioFiles) || manifest.scenarioFiles.length === 0) {
    errors.push("scenarioFiles must be a non-empty array");
  } else if (!manifest.scenarioFiles.every(nonEmptyString)) {
    errors.push("scenarioFiles must contain only non-empty strings");
  }

  return { ok: errors.length === 0, errors };
}

export function normalizeTaskPackManifest(manifest) {
  const validation = validateTaskPackManifest(manifest);
  if (!validation.ok) {
    throw new TypeError(`Invalid TaskPack manifest: ${validation.errors.join("; ")}`);
  }

  const contracts = Object.fromEntries(
    Object.entries(manifest.contracts)
      .sort(([a], [b]) => String(a).localeCompare(String(b)))
  );

  return {
    schemaVersion: 1,
    taskPackId: manifest.taskPackId.trim(),
    version: manifest.version.trim(),
    domain: manifest.domain == null ? null : String(manifest.domain),
    seedPath: manifest.seedPath.trim(),
    activeContractPath: manifest.activeContractPath.trim(),
    grader: {
      path: manifest.grader.path.trim()
    },
    evidenceRefTemplate: manifest.evidenceRefTemplate.trim(),
    contracts,
    scenarioFiles: sortedUnique(manifest.scenarioFiles)
  };
}

export function validateTaskScenario(scenario) {
  const errors = [];

  if (!scenario || typeof scenario !== "object" || Array.isArray(scenario)) {
    return { ok: false, errors: ["scenario must be an object"] };
  }

  if (scenario.schemaVersion !== 1) errors.push("schemaVersion must equal 1");
  if (!nonEmptyString(scenario.scenarioId)) {
    errors.push("scenarioId must be a non-empty string");
  }
  if (!["clean", "perturbed"].includes(scenario.kind)) {
    errors.push("kind must be clean or perturbed");
  }
  if (!Number.isInteger(scenario.initialContractVersion) || scenario.initialContractVersion < 1) {
    errors.push("initialContractVersion must be a positive integer");
  }
  if (!Number.isInteger(scenario.targetContractVersion) || scenario.targetContractVersion < 1) {
    errors.push("targetContractVersion must be a positive integer");
  }
  if (scenario.kind === "perturbed" && (!scenario.perturbation || typeof scenario.perturbation !== "object")) {
    errors.push("perturbed scenario requires perturbation");
  }

  return { ok: errors.length === 0, errors };
}

