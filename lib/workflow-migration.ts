type MigratableNode = { id: string; type: string };
type MigratableEdge = {
  id?: string;
  from: string;
  fromPort?: string;
  to: string;
  toPort?: string;
  dataType?: string;
};

/**
 * Removes the retired Parallel pass-through node while preserving its fan-out.
 * Ordinary output ports support multiple outgoing links, so every incoming
 * value can be connected directly to each former downstream branch.
 */
export function bypassLegacyParallelNodes<
  Node extends MigratableNode,
  Edge extends MigratableEdge,
  Workflow extends { nodes: Node[]; edges: Edge[] },
>(workflow: Workflow): Workflow {
  const parallelNodes = workflow.nodes.filter((node) => node.type === "parallel");
  if (!parallelNodes.length) return workflow;

  let edges = [...workflow.edges];
  for (const parallelNode of parallelNodes) {
    const incoming = edges.filter((edge) => edge.to === parallelNode.id);
    const outgoing = edges.filter((edge) => edge.from === parallelNode.id);
    const unrelated = edges.filter((edge) => edge.to !== parallelNode.id && edge.from !== parallelNode.id);
    const bypasses = incoming.flatMap((source, sourceIndex) => outgoing.map((target, targetIndex) => ({
      ...target,
      id: incoming.length === 1
        ? target.id
        : `${target.id || `edge-${targetIndex}`}-via-${parallelNode.id}-${sourceIndex + 1}`,
      from: source.from,
      fromPort: source.fromPort,
      dataType: source.dataType || target.dataType,
    } as Edge)));

    edges = [...unrelated, ...bypasses].filter((edge, index, all) => all.findIndex((candidate) =>
      candidate.from === edge.from
      && candidate.fromPort === edge.fromPort
      && candidate.to === edge.to
      && candidate.toPort === edge.toPort,
    ) === index);
  }

  return {
    ...workflow,
    nodes: workflow.nodes.filter((node) => node.type !== "parallel"),
    edges,
  };
}
