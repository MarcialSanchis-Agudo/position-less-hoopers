export function replayEvents(events = [], options = {}) {
  const seen = new Set();

  return [...events]
    .filter((event) => {
      if (seen.has(event.id)) return false;
      seen.add(event.id);
      return true;
    })
    .sort((a, b) =>
      String(a.aggregateId).localeCompare(String(b.aggregateId)) ||
      Number(a.sequence) - Number(b.sequence) ||
      String(a.id).localeCompare(String(b.id))
    )
    .map((event) => event.id);
}

