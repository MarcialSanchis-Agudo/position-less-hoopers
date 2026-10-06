function normalizedPermissions(value) {
  return [...new Set(Array.isArray(value) ? value : [])]
    .filter((item) => typeof item === "string")
    .sort();
}

export function planAccessChanges(current = {}, desired = {}, options = {}) {
  const protectedPrincipals = new Set(options.protectedPrincipals ?? []);
  const lockedPermissions = new Set(options.lockedPermissions ?? []);
  const requiredPermissions = options.requiredPermissions ?? {};
  const exclusiveGroups = options.exclusivePermissionGroups ?? [];

  const principals = [...new Set([
    ...Object.keys(current ?? {}),
    ...Object.keys(desired ?? {}),
    ...Object.keys(requiredPermissions)
  ])].sort();

  const changes = [];

  for (const principal of principals) {
    const currentPermissions = normalizedPermissions(current?.[principal]);
    const effectiveDesired = normalizedPermissions([
      ...(desired?.[principal] ?? []),
      ...(requiredPermissions?.[principal] ?? [])
    ]);

    const desiredSet = new Set(effectiveDesired);

    for (const group of exclusiveGroups) {
      const selected = normalizedPermissions(group).filter((permission) =>
        desiredSet.has(permission)
      );
      if (selected.length > 1) {
        throw new Error(
          `exclusive permission conflict for ${principal}: ${selected.join(",")}`
        );
      }
    }

    const currentSet = new Set(currentPermissions);
    const add = effectiveDesired.filter((permission) => !currentSet.has(permission));
    const remove = protectedPrincipals.has(principal)
      ? []
      : currentPermissions.filter(
          (permission) =>
            !desiredSet.has(permission) &&
            !lockedPermissions.has(permission)
        );

    if (add.length || remove.length) {
      changes.push({ principal, add, remove });
    }
  }

  return changes;
}

