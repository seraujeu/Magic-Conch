export type SchedulerPort = { id: string; multiple?: boolean };

export type SchedulerEdge = {
  from: string;
  fromPort?: string;
  toPort?: string;
};

export type NodeActivation = {
  nodeType: string;
  inputPorts: SchedulerPort[];
  incoming: SchedulerEdge[];
  emittedPortKeys: ReadonlySet<string>;
};

const PULL_SOURCE_NODE_TYPES = new Set(["load", "list-directory"]);

function portValueKey(nodeId: string, portId: string) {
  return `${nodeId}:${portId}`;
}

/**
 * Determines whether a topologically ready node is on an active data path.
 *
 * Load nodes are pull-style sources: when one of their outputs is required by
 * the reachable graph, they may run from their saved configuration without a
 * trigger. Connecting any input (including trigger) makes that edge gate the
 * node in the same way as every other workflow node.
 */
export function isWorkflowNodeActive({
  nodeType,
  inputPorts,
  incoming,
  emittedPortKeys,
}: NodeActivation) {
  if (!incoming.length) {
    return inputPorts.length === 0 || PULL_SOURCE_NODE_TYPES.has(nodeType);
  }

  // Join/Aggregate is an optional-input barrier. Once all of its upstream
  // nodes have settled, it must run even when a routed branch emitted no
  // value. The executor will aggregate only the values that did arrive (or
  // produce the operation's empty result when none did).
  if (nodeType === "join") return true;

  const activeIncoming = incoming.filter((edge) =>
    emittedPortKeys.has(portValueKey(edge.from, edge.fromPort || "")),
  );
  if (!activeIncoming.length) return false;

  return inputPorts.every((port) => {
    const portEdges = incoming.filter((edge) => edge.toPort === port.id);
    return !portEdges.length
      || Boolean(port.multiple)
      || portEdges.some((edge) => activeIncoming.includes(edge));
  });
}
