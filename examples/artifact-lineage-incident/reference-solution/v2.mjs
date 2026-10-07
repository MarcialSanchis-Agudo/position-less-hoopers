function valid(record) {
  return record &&
    typeof record.artifactId === "string" &&
    typeof record.source === "string" &&
    typeof record.checksum === "string";
}

function rank(source, priority) {
  const index = priority.indexOf(source);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

export function resolveArtifacts(records = [], options = {}) {
  const blocked = new Set(options.blockedSources ?? []);
  const priority = [...new Set(options.sourcePriority ?? [])];
  const byId = new Map();

  for (const record of records) {
    if (!valid(record) || blocked.has(record.source)) continue;
    const current = byId.get(record.artifactId);
    const candidateRank = rank(record.source, priority);
    const currentRank = current ? rank(current.source, priority) : Infinity;
    const better =
      !current ||
      candidateRank < currentRank ||
      (
        candidateRank === currentRank &&
        (
          String(record.createdAt ?? "").localeCompare(String(current.createdAt ?? "")) < 0 ||
          (
            String(record.createdAt ?? "") === String(current.createdAt ?? "") &&
            record.source.localeCompare(current.source) < 0
          )
        )
      );
    if (better) byId.set(record.artifactId, { ...record });
  }

  return [...byId.values()]
    .sort((a, b) => a.artifactId.localeCompare(b.artifactId))
    .map(({ artifactId, source, checksum }) => ({ artifactId, source, checksum }));
}
