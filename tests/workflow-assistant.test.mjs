import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildWorkflowAssistantRequest,
  buildWorkflowAssistantSystemPrompt,
  normalizeWorkflowAssistantFanIn,
  parseWorkflowAssistantResponse,
  validateWorkflowAssistantGraph,
} from "../lib/workflow-assistant.ts";

const workflow = {
  id: "workflow-1",
  name: "Example",
  description: "An example",
  version: 4,
  updatedAt: "2026-08-20T00:00:00.000Z",
  nodes: [
    { id: "start-1", type: "start", config: {} },
    { id: "end-1", type: "end", config: {} },
  ],
  edges: [{ id: "edge-1", from: "start-1", fromPort: "prompt", to: "end-1", toPort: "prompt", dataType: "prompt" }],
};

test("builds a request containing both the user request and current workflow", () => {
  const request = buildWorkflowAssistantRequest("Add a summarizer", workflow);
  assert.match(request, /User request:\nAdd a summarizer/);
  assert.match(request, /Current workflow:/);
  assert.match(request, /"id": "workflow-1"/);
});

test("includes all instruction documents and a strict JSON contract", () => {
  const prompt = buildWorkflowAssistantSystemPrompt({
    nodeReference: "node rules",
    vibeCodingWorkflow: "workflow rules",
    workflowSyntax: "syntax rules",
  });
  assert.match(prompt, /<NODE_REFERENCE\.md>\nnode rules/);
  assert.match(prompt, /<VIBE_CODING_WORKFLOW\.md>\nworkflow rules/);
  assert.match(prompt, /<WORKFLOW_SYNTAX\.md>\nsyntax rules/);
  assert.match(prompt, /Return only the complete updated workflow/);
});

test("parses plain and fenced workflow JSON", () => {
  assert.equal(parseWorkflowAssistantResponse(JSON.stringify(workflow)).id, "workflow-1");
  assert.equal(parseWorkflowAssistantResponse(`\`\`\`json\n${JSON.stringify(workflow)}\n\`\`\``).name, "Example");
});

test("rejects invalid workflow graphs", () => {
  assert.doesNotThrow(() => validateWorkflowAssistantGraph(workflow));
  assert.throws(() => validateWorkflowAssistantGraph({ ...workflow, nodes: workflow.nodes.slice(1) }), /exactly one Start/);
  assert.throws(() => validateWorkflowAssistantGraph({ ...workflow, edges: [{ ...workflow.edges[0], to: "missing" }] }), /missing node/);
  assert.throws(() => validateWorkflowAssistantGraph({ ...workflow, edges: [{ ...workflow.edges[0], fromPort: undefined }] }), /typed source and target ports/);
});

test("inserts a Join node when a model connects several file branches to End", () => {
  const branched = {
    ...workflow,
    nodes: [
      { id: "start-1", type: "start", name: "Start", x: 0, y: 0, config: {} },
      { id: "files-a", type: "request", name: "Files A", x: 300, y: 0, config: {} },
      { id: "files-b", type: "request", name: "Files B", x: 300, y: 180, config: {} },
      { id: "end-1", type: "end", name: "End", x: 900, y: 80, config: {} },
    ],
    edges: [
      { id: "edge-a", from: "files-a", fromPort: "files", to: "end-1", toPort: "files", dataType: "files" },
      { id: "edge-b", from: "files-b", fromPort: "files", to: "end-1", toPort: "files", dataType: "files" },
    ],
  };
  const normalized = normalizeWorkflowAssistantFanIn(branched, (node, portId) =>
    node.type === "end" && portId === "files" ? { type: "files", label: "files" } : undefined,
  );
  const join = normalized.nodes.find((node) => node.type === "join");
  assert.ok(join);
  assert.equal(join.config.aggregateOperation, "array");
  assert.equal(normalized.edges.filter((edge) => edge.to === join.id).length, 2);
  const endEdges = normalized.edges.filter((edge) => edge.to === "end-1" && edge.toPort === "files");
  assert.equal(endEdges.length, 1);
  assert.equal(endEdges[0].from, join.id);
  assert.equal(endEdges[0].dataType, "any");
});

test("wires a closeable model-selectable assistant to the editor undo history", async () => {
  const workbench = await readFile(new URL("../app/workbench.tsx", import.meta.url), "utf8");
  assert.match(workbench, /NODE_REFERENCE\.md\?raw/);
  assert.match(workbench, /VIBE_CODING_WORKFLOW\.md\?raw/);
  assert.match(workbench, /WORKFLOW_SYNTAX\.md\?raw/);
  assert.match(workbench, /aria-label="Close AI workflow assistant"/);
  assert.match(workbench, /value=\{workflowAssistantProvider\}/);
  assert.match(workbench, /value=\{workflowAssistantModel\}/);
  assert.match(workbench, /useModelDefaults: true/);
  assert.doesNotMatch(workbench, /model,[\s\S]{0,120}temperature: 0\.1/);
  assert.match(workbench, /validateAssistantWorkflow\(edited\);[\s\S]*?updateWorkflow\(\(workflow\) => \(\{/);
  assert.match(workbench, /normalizeWorkflowAssistantFanIn\(parsed/);
  assert.match(workbench, /AI edits use the same Undo\/Redo history as manual edits/);
  assert.match(workbench, /use Undo to reverse it/);
});
