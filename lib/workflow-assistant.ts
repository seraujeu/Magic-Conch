type WorkflowLike = {
  id: string;
  name: string;
  description: string;
  version: number;
  updatedAt: string;
  nodes: Array<{ id: string; type: string; name: string; x: number; y: number; config: Record<string, unknown> }>;
  edges: Array<{
    id: string;
    from: string;
    fromPort?: string;
    to: string;
    toPort?: string;
    dataType?: string;
  }>;
};

type AssistantInputSpec = { multiple?: boolean; type: string; label?: string } | undefined;

function nextUniqueId(prefix: string, used: Set<string>) {
  let index = 1;
  let candidate = `${prefix}-${index}`;
  while (used.has(candidate)) candidate = `${prefix}-${++index}`;
  used.add(candidate);
  return candidate;
}

function jsonObjectText(response: string) {
  const trimmed = response.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1];
  const candidate = (fenced || trimmed).trim();
  if (candidate.startsWith("{") && candidate.endsWith("}")) return candidate;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) return candidate.slice(start, end + 1);
  throw new Error("The model did not return a workflow JSON object.");
}

export function parseWorkflowAssistantResponse(response: string): WorkflowLike {
  let value: unknown;
  try {
    value = JSON.parse(jsonObjectText(response));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("The model")) throw error;
    throw new Error("The model returned invalid workflow JSON.");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The model response is not a workflow object.");
  }
  const workflow = value as Partial<WorkflowLike>;
  if (typeof workflow.id !== "string" || typeof workflow.name !== "string" || typeof workflow.description !== "string") {
    throw new Error("The workflow response is missing its id, name, or description.");
  }
  if (!Array.isArray(workflow.nodes) || !Array.isArray(workflow.edges)) {
    throw new Error("The workflow response must contain node and edge arrays.");
  }
  if (!workflow.nodes.every((node) => node && typeof node.id === "string" && typeof node.type === "string" && node.config && typeof node.config === "object")) {
    throw new Error("One or more workflow nodes are malformed.");
  }
  if (!workflow.edges.every((edge) => edge && typeof edge.id === "string" && typeof edge.from === "string" && typeof edge.to === "string")) {
    throw new Error("One or more workflow edges are malformed.");
  }
  return workflow as WorkflowLike;
}

export function validateWorkflowAssistantGraph(workflow: WorkflowLike) {
  const nodeIds = workflow.nodes.map((node) => node.id);
  const edgeIds = workflow.edges.map((edge) => edge.id);
  if (new Set(nodeIds).size !== nodeIds.length) throw new Error("The model created duplicate node IDs.");
  if (new Set(edgeIds).size !== edgeIds.length) throw new Error("The model created duplicate edge IDs.");
  if (workflow.nodes.filter((node) => node.type === "start").length !== 1) {
    throw new Error("The edited workflow must contain exactly one Start node.");
  }
  if (workflow.nodes.filter((node) => node.type === "end").length !== 1) {
    throw new Error("The edited workflow must contain exactly one End node.");
  }
  const knownNodes = new Set(nodeIds);
  if (workflow.edges.some((edge) => !knownNodes.has(edge.from) || !knownNodes.has(edge.to))) {
    throw new Error("The model created an edge connected to a missing node.");
  }
  if (workflow.edges.some((edge) => !edge.fromPort || !edge.toPort || !edge.dataType || edge.dataType === "flow")) {
    throw new Error("Every workflow edge must use typed source and target ports.");
  }
}

/**
 * The visual editor permits one incoming edge per built-in input socket. Models
 * often express branch convergence by drawing several edges into that socket,
 * so turn that invalid fan-in into the editor's explicit Join representation.
 */
export function normalizeWorkflowAssistantFanIn<W extends WorkflowLike>(
  workflow: W,
  inputSpecFor: (node: W["nodes"][number], portId: string) => AssistantInputSpec,
): W {
  const nodes = workflow.nodes.map((node) => ({ ...node, config: { ...node.config } }));
  let edges = workflow.edges.map((edge) => ({ ...edge }));
  const usedNodeIds = new Set(nodes.map((node) => node.id));
  const usedEdgeIds = new Set(edges.map((edge) => edge.id));
  const groups = new Map<string, typeof edges>();

  for (const edge of edges) {
    const key = `${edge.to}\0${edge.toPort || ""}`;
    groups.set(key, [...(groups.get(key) || []), edge]);
  }

  let mergeOffset = 0;
  for (const incoming of groups.values()) {
    if (incoming.length < 2) continue;
    const target = nodes.find((node) => node.id === incoming[0].to);
    const targetPort = target && inputSpecFor(target as W["nodes"][number], incoming[0].toPort || "");
    if (!target || targetPort?.multiple) continue;

    const joinId = nextUniqueId("assistant-join", usedNodeIds);
    const joinInputs = incoming.map((_edge, index) => ({ id: `input-${index + 1}`, variable: `input${index + 1}` }));
    // Keep one spare socket, matching Join nodes authored in the visual editor.
    joinInputs.push({ id: `input-${joinInputs.length + 1}`, variable: `input${joinInputs.length + 1}` });
    const textInput = ["prompt", "text", "string"].includes(targetPort?.type || "");
    nodes.push({
      id: joinId,
      type: "join",
      name: `Merge ${target.name} ${targetPort?.label || incoming[0].toPort || "input"}`,
      x: target.x - 310,
      y: target.y + mergeOffset,
      config: {
        aggregateOperation: textInput ? "template" : "array",
        joinInputs,
        ...(textInput ? { aggregateTemplate: incoming.map((_edge, index) => `{{input${index + 1}}}`).join("\n\n") } : {}),
      },
    });
    mergeOffset += 145;

    const incomingIds = new Set(incoming.map((edge) => edge.id));
    edges = edges.map((edge) => {
      if (!incomingIds.has(edge.id)) return edge;
      const index = incoming.findIndex((candidate) => candidate.id === edge.id);
      return { ...edge, to: joinId, toPort: joinInputs[index].id };
    });
    edges.push({
      id: nextUniqueId("assistant-merge-edge", usedEdgeIds),
      from: joinId,
      fromPort: "result",
      to: target.id,
      toPort: incoming[0].toPort,
      dataType: "any",
    });
  }

  return { ...workflow, nodes, edges } as W;
}

export function buildWorkflowAssistantSystemPrompt(instructions: {
  nodeReference: string;
  vibeCodingWorkflow: string;
  workflowSyntax: string;
}) {
  return [
    "You are the Magic Conch workflow editor assistant.",
    "Edit the supplied workflow to satisfy the user's request.",
    "Return only the complete updated workflow as one valid JSON object. Do not use Markdown fences or add commentary.",
    "Preserve the workflow id. Use unique node and edge ids. Keep exactly one Start and one End node.",
    "Every edge must name valid typed ports and include dataType. Keep the graph acyclic.",
    "Each input port accepts at most one incoming edge unless its node reference explicitly marks it as multiple. Use Join / Aggregate to merge branches before a single-input port such as End.prompt or End.files.",
    "Do not include provider API keys, local settings, files, or bundledLoads.",
    "Follow all three references below as authoritative instructions.",
    "",
    "<NODE_REFERENCE.md>", instructions.nodeReference, "</NODE_REFERENCE.md>",
    "",
    "<VIBE_CODING_WORKFLOW.md>", instructions.vibeCodingWorkflow, "</VIBE_CODING_WORKFLOW.md>",
    "",
    "<WORKFLOW_SYNTAX.md>", instructions.workflowSyntax, "</WORKFLOW_SYNTAX.md>",
  ].join("\n");
}

export function buildWorkflowAssistantRequest(userRequest: string, workflow: unknown) {
  return [
    "User request:",
    userRequest.trim(),
    "",
    "Current workflow:",
    JSON.stringify(workflow, null, 2),
  ].join("\n");
}
