const DEFAULT_THRESHOLD = 1;

function finiteNonNegative(value, fallback = 0) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function sortedUnique(values = []) {
  return [...new Set(
    values.filter((value) => typeof value === "string" && value.length > 0)
  )].sort((a, b) => a.localeCompare(b));
}

function normalizeNode(node) {
  return {
    id: String(node.id),
    pressure: finiteNonNegative(node.pressure),
    threshold: finiteNonNegative(node.threshold, DEFAULT_THRESHOLD) || DEFAULT_THRESHOLD
  };
}

function normalizeEdge(edge) {
  return {
    from: String(edge.from),
    to: String(edge.to),
    transfer: finiteNonNegative(edge.transfer)
  };
}

function normalizeGroup(group) {
  return {
    id: String(group.id),
    nodeIds: sortedUnique(group.nodeIds),
    threshold: finiteNonNegative(group.threshold, DEFAULT_THRESHOLD) || DEFAULT_THRESHOLD
  };
}

export function createPressureField({
  nodes = [],
  edges = [],
  groups = [],
  maxCascadeSteps = 100
} = {}) {
  const normalizedNodes = nodes.map(normalizeNode)
    .sort((a, b) => a.id.localeCompare(b.id));
  const nodeIds = new Set(normalizedNodes.map((node) => node.id));

  if (nodeIds.size !== normalizedNodes.length) {
    throw new TypeError("PressureField node IDs must be unique");
  }

  const normalizedEdges = edges.map(normalizeEdge);
  for (const edge of normalizedEdges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      throw new TypeError("PressureField edge references unknown node");
    }
    if (edge.transfer > 1) {
      throw new TypeError("PressureField edge transfer must be <= 1");
    }
  }

  const normalizedGroups = groups.map(normalizeGroup)
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const group of normalizedGroups) {
    if (group.nodeIds.length < 2) {
      throw new TypeError("PressureField group requires at least two nodes");
    }
    for (const nodeId of group.nodeIds) {
      if (!nodeIds.has(nodeId)) {
        throw new TypeError("PressureField group references unknown node");
      }
    }
  }

  return {
    schemaVersion: 1,
    nodes: normalizedNodes,
    edges: normalizedEdges,
    groups: normalizedGroups,
    maxCascadeSteps,
    events: []
  };
}

export function pressureSnapshot(field) {
  return {
    schemaVersion: 1,
    nodes: field.nodes.map((node) => ({ ...node })),
    unstableNodeIds: field.nodes
      .filter((node) => node.pressure >= node.threshold)
      .map((node) => node.id),
    unstableGroupIds: field.groups
      .filter((group) => {
        const total = group.nodeIds.reduce((sum, id) => {
          const node = field.nodes.find((item) => item.id === id);
          return sum + (node?.pressure ?? 0);
        }, 0);
        return total >= group.threshold;
      })
      .map((group) => group.id)
  };
}

export function addPressure(field, {
  nodeId,
  amount,
  reason = null,
  at = null
}) {
  const delta = finiteNonNegative(amount);
  const node = field.nodes.find((item) => item.id === nodeId);
  if (!node) throw new TypeError(`Unknown pressure node: ${nodeId}`);

  const next = {
    ...field,
    nodes: field.nodes.map((item) =>
      item.id === nodeId
        ? { ...item, pressure: item.pressure + delta }
        : { ...item }
    ),
    events: [
      ...field.events,
      {
        type: "PressureAdded",
        nodeId,
        amount: delta,
        reason,
        at
      }
    ]
  };

  return next;
}

function propagateFromNode(field, nodeId, releasedPressure, at) {
  let next = field;
  for (const edge of field.edges
    .filter((item) => item.from === nodeId)
    .sort((a, b) => a.to.localeCompare(b.to))) {
    const amount = releasedPressure * edge.transfer;
    if (amount <= 0) continue;
    next = addPressure(next, {
      nodeId: edge.to,
      amount,
      reason: `propagated_from:${nodeId}`,
      at
    });
  }
  return next;
}

function toppleNode(field, nodeId, at) {
  const node = field.nodes.find((item) => item.id === nodeId);
  if (!node || node.pressure < node.threshold) return field;

  const released = node.threshold;
  let next = {
    ...field,
    nodes: field.nodes.map((item) =>
      item.id === nodeId
        ? { ...item, pressure: Math.max(0, item.pressure - released) }
        : { ...item }
    ),
    events: [
      ...field.events,
      {
        type: "PressureNodeToppled",
        nodeId,
        releasedPressure: released,
        at
      }
    ]
  };

  next = propagateFromNode(next, nodeId, released, at);
  return next;
}

function groupPressure(field, group) {
  return group.nodeIds.reduce((sum, id) => {
    const node = field.nodes.find((item) => item.id === id);
    return sum + (node?.pressure ?? 0);
  }, 0);
}

function toppleGroup(field, group, at) {
  const total = groupPressure(field, group);
  if (total < group.threshold) return field;

  const consumed = Math.min(total, group.threshold);
  const weights = group.nodeIds.map((id) => {
    const node = field.nodes.find((item) => item.id === id);
    return { id, pressure: node?.pressure ?? 0 };
  });
  const denom = weights.reduce((sum, item) => sum + item.pressure, 0) || 1;

  return {
    ...field,
    nodes: field.nodes.map((node) => {
      const member = weights.find((item) => item.id === node.id);
      if (!member) return { ...node };
      const share = consumed * (member.pressure / denom);
      return {
        ...node,
        pressure: Math.max(0, node.pressure - share)
      };
    }),
    events: [
      ...field.events,
      {
        type: "PressureGroupToppled",
        groupId: group.id,
        nodeIds: group.nodeIds,
        releasedPressure: consumed,
        at
      }
    ]
  };
}

export function stabilizePressureField(field, {
  at = null,
  nodeFirst = true
} = {}) {
  let next = {
    ...field,
    nodes: field.nodes.map((node) => ({ ...node })),
    events: [...field.events]
  };

  const triggers = [];

  for (let step = 0; step < field.maxCascadeSteps; step += 1) {
    const unstableNodes = next.nodes
      .filter((node) => node.pressure >= node.threshold)
      .sort((a, b) =>
        (b.pressure / b.threshold) - (a.pressure / a.threshold) ||
        a.id.localeCompare(b.id)
      );

    const unstableGroups = next.groups
      .map((group) => ({ group, pressure: groupPressure(next, group) }))
      .filter((entry) => entry.pressure >= entry.group.threshold)
      .sort((a, b) =>
        (b.pressure / b.group.threshold) - (a.pressure / a.group.threshold) ||
        a.group.id.localeCompare(b.group.id)
      );

    if (unstableNodes.length === 0 && unstableGroups.length === 0) {
      return {
        field: next,
        triggers,
        stable: true,
        cascadeSteps: step
      };
    }

    if (nodeFirst && unstableNodes.length > 0) {
      const node = unstableNodes[0];
      triggers.push({
        kind: "node",
        id: node.id,
        pressure: node.pressure,
        threshold: node.threshold
      });
      next = toppleNode(next, node.id, at);
      continue;
    }

    if (unstableGroups.length > 0) {
      const entry = unstableGroups[0];
      triggers.push({
        kind: "group",
        id: entry.group.id,
        nodeIds: entry.group.nodeIds,
        pressure: entry.pressure,
        threshold: entry.group.threshold
      });
      next = toppleGroup(next, entry.group, at);
      continue;
    }

    const node = unstableNodes[0];
    triggers.push({
      kind: "node",
      id: node.id,
      pressure: node.pressure,
      threshold: node.threshold
    });
    next = toppleNode(next, node.id, at);
  }

  return {
    field: next,
    triggers,
    stable: false,
    cascadeSteps: field.maxCascadeSteps,
    reason: "max_cascade_steps"
  };
}

