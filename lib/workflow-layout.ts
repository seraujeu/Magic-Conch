export type LayoutNode = {
  id: string;
  x: number;
  y: number;
};

export type LayoutEdge = {
  from: string;
  to: string;
};

export type WorkflowLayoutOptions<Node extends LayoutNode> = {
  nodeHeight: (node: Node) => number;
  horizontalGap?: number;
  verticalGap?: number;
};

/**
 * Places dependencies from left to right and stacks nodes in each dependency
 * level. The original array order is used as the stable tie-breaker.
 */
export function organizeWorkflowNodes<Node extends LayoutNode>(
  nodes: Node[],
  edges: LayoutEdge[],
  options: WorkflowLayoutOptions<Node>,
): Node[] {
  if (nodes.length < 2) return nodes.map((node) => ({ ...node }));

  const nodeIds = new Set(nodes.map((node) => node.id));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to) || edge.from === edge.to) continue;
    outgoing.get(edge.from)!.push(edge.to);
    indegree.set(edge.to, indegree.get(edge.to)! + 1);
  }

  const ranks = new Map<string, number>();
  const queue = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  for (const id of queue) ranks.set(id, 0);
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];
    const nextRank = (ranks.get(id) || 0) + 1;
    for (const target of outgoing.get(id) || []) {
      ranks.set(target, Math.max(ranks.get(target) || 0, nextRank));
      const remaining = indegree.get(target)! - 1;
      indegree.set(target, remaining);
      if (remaining === 0) queue.push(target);
    }
  }

  // A workflow can temporarily contain a cycle while it is being edited.
  // Keep cyclic nodes deterministic and overlap-free instead of refusing to lay
  // out the rest of the graph.
  for (const node of nodes) {
    if (!ranks.has(node.id)) ranks.set(node.id, 0);
  }

  const originX = Math.min(...nodes.map((node) => node.x));
  const originY = Math.min(...nodes.map((node) => node.y));
  const horizontalGap = options.horizontalGap ?? 360;
  const verticalGap = options.verticalGap ?? 64;
  const columns = new Map<number, Node[]>();
  for (const node of nodes) {
    const rank = ranks.get(node.id)!;
    columns.set(rank, [...(columns.get(rank) || []), node]);
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (const [rank, column] of columns) {
    let y = originY;
    for (const node of column) {
      positions.set(node.id, { x: originX + rank * horizontalGap, y });
      y += Math.max(1, options.nodeHeight(node)) + verticalGap;
    }
  }

  return nodes.map((node) => ({ ...node, ...positions.get(node.id)! }));
}
