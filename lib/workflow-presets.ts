export type PresetNodeLike = {
  id: string;
  x: number;
  y: number;
};

export type PresetEdgeLike = {
  id: string;
  from: string;
  to: string;
};

export type WorkflowPreset<
  Node extends PresetNodeLike = PresetNodeLike,
  Edge extends PresetEdgeLike = PresetEdgeLike,
> = {
  id: string;
  name: string;
  createdAt: string;
  nodes: Node[];
  edges: Edge[];
};

export function createWorkflowPreset<Node extends PresetNodeLike, Edge extends PresetEdgeLike>(
  name: string,
  nodes: Node[],
  edges: Edge[],
  id: string,
  createdAt = new Date().toISOString(),
): WorkflowPreset<Node, Edge> {
  if (!nodes.length) throw new Error("A preset requires at least one node.");
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("A preset requires a name.");

  const includedIds = new Set(nodes.map((node) => node.id));
  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));

  return {
    id,
    name: trimmedName,
    createdAt,
    nodes: nodes.map((node) => ({ ...structuredClone(node), x: node.x - minX, y: node.y - minY })),
    edges: edges
      .filter((edge) => includedIds.has(edge.from) && includedIds.has(edge.to))
      .map((edge) => structuredClone(edge)),
  };
}

export function instantiateWorkflowPreset<Node extends PresetNodeLike, Edge extends PresetEdgeLike>(
  preset: WorkflowPreset<Node, Edge>,
  origin: { x: number; y: number },
  nodeId: (node: Node) => string,
  edgeId: (edge: Edge) => string,
): { nodes: Node[]; edges: Edge[] } {
  const nodeIds = new Map(preset.nodes.map((node) => [node.id, nodeId(node)]));
  const nodes = preset.nodes.map((node) => ({
    ...structuredClone(node),
    id: nodeIds.get(node.id)!,
    x: origin.x + node.x,
    y: origin.y + node.y,
  }));
  const edges = preset.edges
    .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))
    .map((edge) => ({
      ...structuredClone(edge),
      id: edgeId(edge),
      from: nodeIds.get(edge.from)!,
      to: nodeIds.get(edge.to)!,
    }));

  return { nodes, edges };
}

export function parseWorkflowPresets<Node extends PresetNodeLike, Edge extends PresetEdgeLike>(
  value: unknown,
): WorkflowPreset<Node, Edge>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is WorkflowPreset<Node, Edge> => {
    if (!item || typeof item !== "object") return false;
    const candidate = item as Partial<WorkflowPreset<Node, Edge>>;
    return typeof candidate.id === "string"
      && typeof candidate.name === "string"
      && typeof candidate.createdAt === "string"
      && Array.isArray(candidate.nodes)
      && candidate.nodes.length > 0
      && candidate.nodes.every((node) => node && typeof node.id === "string" && Number.isFinite(node.x) && Number.isFinite(node.y))
      && Array.isArray(candidate.edges)
      && candidate.edges.every((edge) => edge && typeof edge.id === "string" && typeof edge.from === "string" && typeof edge.to === "string");
  });
}
