export function normalizeEvidence(items) {
  const byRef = new Map();
  for (const item of items) {
    byRef.set(item.ref, item);
  }
  return [...byRef.values()].sort((a, b) => a.ref.localeCompare(b.ref));
}

