function compareEvents(a, b) {
  return (
    String(a.aggregateId).localeCompare(String(b.aggregateId)) ||
    Number(a.sequence) - Number(b.sequence) ||
    String(a.id).localeCompare(String(b.id))
  );
}

export function replayEvents(events = [], options = {}) {
  const seenIds = new Set();
  const blocked = new Set(options.blockedAggregates ?? []);
  const minByAggregate = options.minSequenceByAggregate ?? {};
  const firstById = [];

  for (const event of events) {
    if (seenIds.has(event.id)) continue;
    seenIds.add(event.id);
    firstById.push(event);
  }

  const eligible = firstById.filter((event) => {
    if (blocked.has(event.aggregateId)) return false;
    const min = minByAggregate[event.aggregateId];
    return min == null || Number(event.sequence) >= Number(min);
  });

  const winners = new Map();
  for (const event of eligible) {
    const key = `${event.aggregateId}\u0000${event.sequence}`;
    const current = winners.get(key);
    if (!current || String(event.id).localeCompare(String(current.id)) < 0) {
      winners.set(key, event);
    }
  }

  return [...winners.values()].sort(compareEvents).map((event) => event.id);
}

