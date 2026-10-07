export function normalizePartnerRecords(records = [], options = {}) {
  return records
    .filter((record) => record && record.id != null)
    .map((record) => ({
      id: String(record.id),
      value: record.value == null ? "" : String(record.value)
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
