function intersection(left, right) {
  const set = new Set(right);
  return [...new Set(left.filter((value) => set.has(value)))].sort();
}

export function overlapPairs(work) {
  const active = work.filter((item) => item.status === "active");
  const out = [];

  for (const left of active) {
    for (const right of active) {
      if (left.id === right.id) continue;
      const refs = intersection(left.writeSet ?? [], right.writeSet ?? []);
      if (refs.length) {
        out.push({ left: left.id, right: right.id, refs });
      }
    }
  }

  return out;
}

