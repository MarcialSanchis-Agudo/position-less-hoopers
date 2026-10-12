export function buildLocalModelLock({ model, localProvider, evalSetArg, ontologyArg, adapterArg, repeats }) {
  if (typeof model !== "string" || model.trim() === "") {
    throw new TypeError("PLH_LOCAL_MODEL must be set");
  }
  return {
    schemaVersion: 1,
    runnerVersion: "local-frontier-v0.2",
    model: model.trim(),
    localProvider: (localProvider || "ollama").trim(),
    evalSetArg,
    ontologyArg,
    adapterArg,
    repeats: Number(repeats)
  };
}

export function validateLocalModelLock(actual, expected) {
  for (const key of ["model", "localProvider", "evalSetArg", "ontologyArg", "adapterArg", "repeats"]) {
    if (actual?.[key] !== expected?.[key]) {
      throw new Error(`local model lock mismatch for ${key}: ${actual?.[key]} !== ${expected?.[key]}`);
    }
  }
  return true;
}
