type BundleNode = {
  id?: string;
  type: string;
  config?: { calledWorkflowId?: string };
};

export type BundleWorkflow = {
  id: string;
  nodes: BundleNode[];
  edges?: { from: string; to: string }[];
};

export type BundlePlugin = {
  id: string;
  nodes: { type: string }[];
};

function bundleRuntimeNodes(workflow: BundleWorkflow) {
  if (!workflow.edges || workflow.nodes.some((node) => !node.id)) return workflow.nodes;
  const runtimeIds = workflowRuntimeNodeIds(workflow as {
    nodes: { id: string; type: string }[];
    edges: { from: string; to: string }[];
  });
  return workflow.nodes.filter((node) => runtimeIds.has(node.id!));
}

export function collectWorkflowBundleDependencies<
  W extends BundleWorkflow,
  P extends BundlePlugin,
>(root: W, workflows: W[], plugins: P[]) {
  const included: W[] = [];
  const visited = new Set<string>();
  const queue = [root];

  while (queue.length) {
    const workflow = queue.shift()!;
    if (visited.has(workflow.id)) continue;
    visited.add(workflow.id);
    included.push(workflow);
    for (const node of bundleRuntimeNodes(workflow)) {
      const dependencyId = node.config?.calledWorkflowId;
      const dependency = dependencyId && workflows.find((candidate) => candidate.id === dependencyId);
      if (dependency && !visited.has(dependency.id)) queue.push(dependency);
    }
  }

  const usedNodeTypes = new Set(included.flatMap((workflow) => bundleRuntimeNodes(workflow).map((node) => node.type)));
  const usedPlugins = plugins.filter((plugin) => plugin.nodes.some((node) => usedNodeTypes.has(node.type)));
  return { workflows: included, plugins: usedPlugins };
}

export function portableDependencySegment(value: string) {
  return value.normalize("NFC").replace(/[^\p{L}\p{M}\p{N}_.-]+/gu, "-").replace(/^-+|-+$/g, "") || "dependency";
}

export function remapPackagedWorkflowIds<W extends BundleWorkflow>(workflows: W[], createId: () => string) {
  const idMap = new Map(workflows.map((workflow) => [workflow.id, createId()]));
  return workflows.map((workflow) => ({
    ...workflow,
    id: idMap.get(workflow.id)!,
    nodes: workflow.nodes.map((node) => ({
      ...node,
      config: node.config ? {
        ...node.config,
        calledWorkflowId: node.config.calledWorkflowId
          ? idMap.get(node.config.calledWorkflowId) || node.config.calledWorkflowId
          : undefined,
      } : node.config,
    })),
  })) as W[];
}

export function workflowRuntimeNodeIds(workflow: {
  nodes: { id: string; type: string }[];
  edges: { from: string; to: string }[];
}) {
  const start = workflow.nodes.find((node) => node.type === "start");
  if (!start) return new Set(workflow.nodes.map((node) => node.id));
  const reachable = new Set<string>([start.id]);
  const queue = [start.id];
  while (queue.length) {
    const sourceId = queue.shift()!;
    for (const edge of workflow.edges.filter((candidate) => candidate.from === sourceId)) {
      if (!reachable.has(edge.to)) {
        reachable.add(edge.to);
        queue.push(edge.to);
      }
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of workflow.edges) {
      if (reachable.has(edge.to) && !reachable.has(edge.from)) {
        reachable.add(edge.from);
        changed = true;
      }
    }
  }
  return reachable;
}
