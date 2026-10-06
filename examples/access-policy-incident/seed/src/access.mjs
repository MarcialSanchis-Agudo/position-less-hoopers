function normalizedPermissions(value) {
  return [...new Set(Array.isArray(value) ? value : [])]
    .filter((item) => typeof item === "string")
    .sort();
}

export function planAccessChanges(current = {}, desired = {}, options = {}) {
  const principals = [...new Set([
    ...Object.keys(current ?? {}),
    ...Object.keys(desired ?? {})
  ])].sort();

  const changes = [];

  for (const principal of principals) {
    const currentPermissions = normalizedPermissions(current?.[principal]);
    const desiredPermissions = normalizedPermissions(desired?.[principal]);

    const currentSet = new Set(currentPermissions);
    const desiredSet = new Set(desiredPermissions);

    const add = desiredPermissions.filter((permission) => !currentSet.has(permission));
    const remove = currentPermissions.filter((permission) => !desiredSet.has(permission));

    if (add.length || remove.length) {
      changes.push({ principal, add, remove });
    }
  }

  return changes;
}

