function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function finite(value) {
  return Number.isFinite(value) ? value : null;
}

export function validateContextReloadRun(run) {
  const errors = [];
  if (!run || typeof run !== "object" || Array.isArray(run)) {
    return { ok: false, errors: ["run must be an object"] };
  }
  if (run.schemaVersion !== 1) errors.push("schemaVersion must equal 1");
  if (!["warm", "cold"].includes(run.condition)) errors.push("condition must be warm or cold");
  for (const key of ["runId", "pairId", "taskId", "modelId", "contextPackageHash"]) {
    if (typeof run[key] !== "string" || !run[key].trim()) {
      errors.push(`${key} must be a non-empty string`);
    }
  }
  for (const key of ["startedAt", "finishedAt"]) {
    if (typeof run[key] !== "string" || !Number.isFinite(Date.parse(run[key]))) {
      errors.push(`${key} must be a valid timestamp`);
    }
  }
  if (
    typeof run.startedAt === "string" &&
    typeof run.finishedAt === "string" &&
    Number.isFinite(Date.parse(run.startedAt)) &&
    Number.isFinite(Date.parse(run.finishedAt)) &&
    Date.parse(run.finishedAt) < Date.parse(run.startedAt)
  ) {
    errors.push("finishedAt must not precede startedAt");
  }

  for (const key of [
    "inputTokens",
    "outputTokens",
    "toolCalls",
    "fileReads",
    "repeatedFileReads",
    "staleStateActions"
  ]) {
    if (!Number.isInteger(run[key]) || run[key] < 0) {
      errors.push(`${key} must be a non-negative integer`);
    }
  }

  if (run.timeToFirstUsefulActionMs != null &&
      (!Number.isFinite(run.timeToFirstUsefulActionMs) || run.timeToFirstUsefulActionMs < 0)) {
    errors.push("timeToFirstUsefulActionMs must be a non-negative number or null");
  }

  if (typeof run.correct !== "boolean") errors.push("correct must be boolean");

  return { ok: errors.length === 0, errors };
}

export function summarizeContextReloadPair(warm, cold) {
  const warmValid = validateContextReloadRun(warm);
  const coldValid = validateContextReloadRun(cold);
  if (!warmValid.ok || !coldValid.ok) {
    throw new TypeError([
      ...warmValid.errors.map((error) => `warm: ${error}`),
      ...coldValid.errors.map((error) => `cold: ${error}`)
    ].join("; "));
  }
  if (warm.pairId !== cold.pairId) throw new TypeError("pairId mismatch");
  if (warm.taskId !== cold.taskId) throw new TypeError("taskId mismatch");
  if (warm.modelId !== cold.modelId) throw new TypeError("modelId mismatch");

  const duration = (run) => Date.parse(run.finishedAt) - Date.parse(run.startedAt);

  return {
    schemaVersion: 1,
    pairId: warm.pairId,
    taskId: warm.taskId,
    modelId: warm.modelId,
    warmCorrect: warm.correct,
    coldCorrect: cold.correct,
    delta: {
      inputTokens: cold.inputTokens - warm.inputTokens,
      outputTokens: cold.outputTokens - warm.outputTokens,
      totalTokens:
        (cold.inputTokens + cold.outputTokens) -
        (warm.inputTokens + warm.outputTokens),
      toolCalls: cold.toolCalls - warm.toolCalls,
      fileReads: cold.fileReads - warm.fileReads,
      repeatedFileReads: cold.repeatedFileReads - warm.repeatedFileReads,
      staleStateActions: cold.staleStateActions - warm.staleStateActions,
      durationMs: duration(cold) - duration(warm),
      timeToFirstUsefulActionMs:
        finite(cold.timeToFirstUsefulActionMs) != null &&
        finite(warm.timeToFirstUsefulActionMs) != null
          ? cold.timeToFirstUsefulActionMs - warm.timeToFirstUsefulActionMs
          : null
    }
  };
}

export function summarizeContextReloadExperiment(runs) {
  const pairs = new Map();

  for (const run of runs) {
    const validation = validateContextReloadRun(run);
    if (!validation.ok) {
      throw new TypeError(`Invalid context-reload run ${run?.runId ?? "unknown"}: ${validation.errors.join("; ")}`);
    }
    const current = pairs.get(run.pairId) ?? {};
    if (current[run.condition]) {
      throw new TypeError(`Duplicate ${run.condition} run for pair ${run.pairId}`);
    }
    current[run.condition] = run;
    pairs.set(run.pairId, current);
  }

  const summaries = [];
  for (const [pairId, pair] of pairs) {
    if (!pair.warm || !pair.cold) {
      throw new TypeError(`Incomplete warm/cold pair: ${pairId}`);
    }
    summaries.push(summarizeContextReloadPair(pair.warm, pair.cold));
  }

  const deltaKeys = [
    "inputTokens",
    "outputTokens",
    "totalTokens",
    "toolCalls",
    "fileReads",
    "repeatedFileReads",
    "staleStateActions",
    "durationMs",
    "timeToFirstUsefulActionMs"
  ];

  const aggregate = {};
  for (const key of deltaKeys) {
    const values = summaries
      .map((summary) => summary.delta[key])
      .filter((value) => Number.isFinite(value));
    aggregate[key] = {
      n: values.length,
      mean: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
      median: median(values)
    };
  }

  aggregate.correctness = {
    pairs: summaries.length,
    warmCorrect: summaries.filter((summary) => summary.warmCorrect).length,
    coldCorrect: summaries.filter((summary) => summary.coldCorrect).length,
    warmOnlyCorrect: summaries.filter((summary) => summary.warmCorrect && !summary.coldCorrect).length,
    coldOnlyCorrect: summaries.filter((summary) => !summary.warmCorrect && summary.coldCorrect).length
  };

  return {
    schemaVersion: 1,
    pairs: summaries.sort((a, b) => a.pairId.localeCompare(b.pairId)),
    aggregate
  };
}

