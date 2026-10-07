function valid(record) {
  return record &&
    typeof record.artifactId === "string" &&
    typeof record.source === "string" &&
    typeof record.checksum === "string";
}

function compareBase(a, b) {
  return (
    String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")) ||
    a.source.localeCompare(b.source)
  );
}

export function resolveArtifacts(records = [], options = {}) {
  const byId = new Map();

  for (const record of records) {
    if (!valid(record)) continue;
    const current = byId.get(record.artifactId);
    if (!current || compareBase(record, current) < 0) {
      byId.set(record.artifactId, { ...record });
    }
  }

  return [...byId.values()]
    .sort((a, b) => a.artifactId.localeCompare(b.artifactId))
    .map(({ artifactId, source, checksum }) => ({
      artifactId,
      source,
      checksum
    }));
}
