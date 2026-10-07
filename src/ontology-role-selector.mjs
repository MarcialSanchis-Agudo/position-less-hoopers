function sortedUnique(values = []) {
  return [...new Set(
    values.filter((value) => typeof value === "string" && value.length > 0)
  )].sort((a, b) => a.localeCompare(b));
}

function overlapRatio(left = [], right = []) {
  const a = new Set(sortedUnique(left));
  const b = new Set(sortedUnique(right));
  if (a.size === 0) return 0;
  let hits = 0;
  for (const item of a) if (b.has(item)) hits += 1;
  return hits / a.size;
}

export const DEFAULT_ONTOLOGY_ROLE_SELECTION_WEIGHTS = Object.freeze({
  context: 1,
  capability: 0.2
});

export function rankPredefinedRoles({
  roles = {},
  stateRequirements = {},
  weights = DEFAULT_ONTOLOGY_ROLE_SELECTION_WEIGHTS
} = {}) {
  const contextRefs = sortedUnique(stateRequirements.contextRefs);
  const capabilities = sortedUnique(stateRequirements.capabilities);

  return Object.entries(roles)
    .map(([roleId, role]) => {
      const contextCoverage = overlapRatio(
        contextRefs,
        role.contextRefs ?? []
      );
      const capabilityCoverage = overlapRatio(
        capabilities,
        role.requiredCapabilities ?? []
      );
      return {
        roleId,
        contextCoverage,
        capabilityCoverage,
        total:
          weights.context * contextCoverage +
          weights.capability * capabilityCoverage
      };
    })
    .sort((a, b) =>
      b.total - a.total ||
      b.contextCoverage - a.contextCoverage ||
      b.capabilityCoverage - a.capabilityCoverage ||
      a.roleId.localeCompare(b.roleId)
    );
}

export function choosePredefinedRole(input = {}) {
  const ranked = rankPredefinedRoles(input);
  const winner = ranked[0] ?? null;
  return {
    schemaVersion: 1,
    selectedRoleId: winner?.roleId ?? null,
    selectedScore: winner ?? null,
    ranked
  };
}
