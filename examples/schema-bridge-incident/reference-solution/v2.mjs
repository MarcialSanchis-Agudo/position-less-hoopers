export function normalizePartnerRecords(records = [], options = {}) {
  const blocked = new Set((options.blockedIds ?? []).map(String));
  const byId = new Map();

  for (const record of records) {
    if (!record || record.id == null) continue;
    const id = String(record.id);
    if (blocked.has(id)) continue;
    const raw = record.value == null ? options.defaultValue : record.value;
    byId.set(id, {
      id,
      value: raw == null ? "" : String(raw)
    });
  }

  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}
