export function planRollout(nodes, options = {}) {
  const maxBatchSize = options.maxBatchSize ?? 2;
  const blocked = new Set(options.blockedZones ?? []);

  let remaining = nodes.filter(
    (node) =>
      node.healthy !== false &&
      !blocked.has(node.zone)
  );

  const batches = [];
  const canaryIndex = remaining.findIndex(
    (node) => node.id === options.canaryNodeId
  );
  const hasEligibleCanary = canaryIndex >= 0;

  if (hasEligibleCanary) {
    const [canary] = remaining.splice(canaryIndex, 1);
    batches.push([canary.id]);
  }

  if (!hasEligibleCanary) {
    for (let index = 0; index < remaining.length; index += maxBatchSize) {
      batches.push(
        remaining
          .slice(index, index + maxBatchSize)
          .map((node) => node.id)
      );
    }
    return batches;
  }

  while (remaining.length > 0) {
    const batch = [];
    const zones = new Set();

    for (
      let index = 0;
      index < remaining.length &&
      batch.length < maxBatchSize;
    ) {
      const node = remaining[index];

      if (zones.has(node.zone)) {
        index += 1;
        continue;
      }

      batch.push(node.id);
      zones.add(node.zone);
      remaining.splice(index, 1);
    }

    if (batch.length === 0) {
      throw new Error("No schedulable nodes remain");
    }

    batches.push(batch);
  }

  return batches;
}

