import fs from "node:fs";
import { fileURLToPath } from "node:url";

const schemaPath = fileURLToPath(
  new URL("../state/schema-history.json", import.meta.url)
);

function readSchema() {
  return JSON.parse(fs.readFileSync(schemaPath, "utf8"));
}

export function normalizePartnerRecords(records = [], options = {}) {
  const schema = readSchema();
  const blocked = new Set((options.blockedIds ?? []).map(String));
  const active = new Set(schema.activeStatuses ?? []);
  const byId = new Map();

  for (const record of records) {
    if (!record) continue;
    const rawId = record[schema.idField];
    if (rawId == null) continue;
    const id = String(rawId);
    if (blocked.has(id)) continue;
    if (!active.has(record[schema.statusField])) continue;

    let raw = record[schema.valueField];
    if (raw == null) raw = options.defaultValue;
    let value = raw == null ? "" : raw;
    if (
      schema.valueCoercion === "number_to_string" &&
      typeof value === "number"
    ) {
      value = String(value);
    } else if (value != null) {
      value = String(value);
    }

    byId.set(id, { id, value });
  }

  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}
