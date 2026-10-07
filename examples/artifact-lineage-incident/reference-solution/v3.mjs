import fs from "node:fs";
import { fileURLToPath } from "node:url";

const provenancePath = fileURLToPath(
  new URL("../state/provenance.json", import.meta.url)
);

function readProvenance() {
  return JSON.parse(fs.readFileSync(provenancePath, "utf8"));
}

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
  const provenance = readProvenance();
  const aliases = provenance.aliases ?? {};
  const rejected = new Set(provenance.rejectedSources ?? []);
  const blocked = new Set(options.blockedSources ?? []);
  const priority = [...new Set([
    ...(provenance.sourcePriority ?? []),
    ...(options.sourcePriority ?? [])
  ])];

  const byId = new Map();

  for (const input of records) {
    if (!valid(input)) continue;
    const source = aliases[input.source] ?? input.source;
    if (rejected.has(source) || blocked.has(source) || blocked.has(input.source)) {
      continue;
    }
    const record = { ...input, source };
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
    if (better) byId.set(record.artifactId, record);
  }

  return [...byId.values()]
    .sort((a, b) => a.artifactId.localeCompare(b.artifactId))
    .map(({ artifactId, source, checksum }) => ({ artifactId, source, checksum }));
}
