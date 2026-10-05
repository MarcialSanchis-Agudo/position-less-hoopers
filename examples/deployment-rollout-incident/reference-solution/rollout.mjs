export function planRollout(nodes, options = {}) {
  const maxBatchSize = options.maxBatchSize ?? 2;
  const maxBatchWeight =
    options.maxBatchWeight ?? Number.POSITIVE_INFINITY;
  const blocked = new Set(options.blockedZones ?? []);

  let remaining = nodes.filter(
    (node) =>
      node.healthy !== false &&
      node.maintenance !== true &&
      !blocked.has(node.zone)
  );

  const eligibleIds = new Set(remaining.map((node) => node.id));
  const deployed = new Set();
  const batches = [];

  const canaryIndex = remaining.findIndex(
    (node) => node.id === options.canaryNodeId
  );
  const hasEligibleCanary = canaryIndex >= 0;

  if (hasEligibleCanary) {
    const canary = remaining[canaryIndex];
    const unresolved = (canary.dependsOn ?? [])
      .filter((id) => eligibleIds.has(id) && !deployed.has(id));

    if (unresolved.length > 0) {
      throw new Error(
        "Eligible canary has unresolved eligible dependencies"
      );
    }

    const weight = canary.weight ?? 1;
    if (weight > maxBatchWeight) {
      throw new Error("canary exceeds maxBatchWeight");
    }

    remaining.splice(canaryIndex, 1);
    batches.push([canary.id]);
    deployed.add(canary.id);
  }

  while (remaining.length > 0) {
    const batch = [];
    const zones = new Set();
    let batchWeight = 0;

    for (
      let index = 0;
      index < remaining.length &&
      batch.length < maxBatchSize;
    ) {
      const node = remaining[index];
      const unresolved = (node.dependsOn ?? [])
        .filter((id) =>
          eligibleIds.has(id) && !deployed.has(id)
        );
      const weight = node.weight ?? 1;

      const zoneConflict =
        hasEligibleCanary && zones.has(node.zone);

      if (
        unresolved.length > 0 ||
        zoneConflict ||
        batchWeight + weight > maxBatchWeight
      ) {
        index += 1;
        continue;
      }

      batch.push(node.id);
      if (hasEligibleCanary) zones.add(node.zone);
      batchWeight += weight;
      remaining.splice(index, 1);
    }

    if (batch.length === 0) {
      throw new Error(
        "No schedulable nodes remain; dependencies or constraints are unresolved"
      );
    }

    batches.push(batch);
    for (const id of batch) deployed.add(id);
  }

  return batches;
}

