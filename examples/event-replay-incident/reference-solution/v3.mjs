function compareEvents(a, b) {
  return (
    String(a.aggregateId).localeCompare(String(b.aggregateId)) ||
    Number(a.sequence) - Number(b.sequence) ||
    String(a.id).localeCompare(String(b.id))
  );
}

function v2Eligible(events, options) {
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

  return [...winners.values()];
}

export function replayEvents(events = [], options = {}) {
  const eligible = v2Eligible(events, options);
  const byId = new Map(eligible.map((event) => [event.id, event]));
  const dependencies = options.dependencies ?? {};

  for (const event of eligible) {
    for (const dependencyId of dependencies[event.id] ?? []) {
      if (!byId.has(dependencyId)) {
        throw new Error(
          `unresolved dependency for ${event.id}: ${dependencyId}`
        );
      }
    }
  }

  const emitted = [];
  const emittedSet = new Set();
  const pending = new Map(eligible.map((event) => [event.id, event]));

  while (pending.size) {
    const ready = [...pending.values()]
      .filter((event) =>
        (dependencies[event.id] ?? []).every((id) => emittedSet.has(id))
      )
      .sort(compareEvents);

    if (!ready.length) {
      throw new Error("dependency cycle");
    }

    const next = ready[0];
    emitted.push(next.id);
    emittedSet.add(next.id);
    pending.delete(next.id);
  }

  return emitted;
}

