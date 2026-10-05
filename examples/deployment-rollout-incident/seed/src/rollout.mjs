export function planRollout(nodes, options = {}) {
  const maxBatchSize = options.maxBatchSize ?? 2;
  const eligible = nodes.filter((node) => node.healthy !== false);
  const batches = [];

  for (let index = 0; index < eligible.length; index += maxBatchSize) {
    batches.push(
      eligible
        .slice(index, index + maxBatchSize)
        .map((node) => node.id)
    );
  }

  return batches;
}

