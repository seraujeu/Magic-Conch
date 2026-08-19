import assert from "node:assert/strict";
import test from "node:test";
import { collectWorkflowBundleDependencies, createWorkflowJsonBundle, portableDependencySegment, remapPackagedWorkflowIds, unpackWorkflowJsonBundle, workflowRuntimeNodeIds } from "../lib/workflow-bundle.ts";

test("collects called workflows transitively and only their used plug-ins", () => {
  const leaf = { id: "leaf", nodes: [{ type: "image-tools:resize", config: {} }] };
  const child = { id: "child", nodes: [{ type: "workflow", config: { calledWorkflowId: "leaf" } }] };
  const root = { id: "root", nodes: [
    { type: "workflow", config: { calledWorkflowId: "child" } },
    { type: "text-tools:format", config: {} },
  ] };
  const unused = { id: "unused", nodes: [{ type: "unused-tools:run", config: {} }] };
  const plugins = [
    { id: "text-tools", nodes: [{ type: "text-tools:format" }] },
    { id: "image-tools", nodes: [{ type: "image-tools:resize" }] },
    { id: "unused-tools", nodes: [{ type: "unused-tools:run" }] },
  ];

  const bundled = collectWorkflowBundleDependencies(root, [root, child, leaf, unused], plugins);
  assert.deepEqual(bundled.workflows.map((workflow) => workflow.id), ["root", "child", "leaf"]);
  assert.deepEqual(bundled.plugins.map((plugin) => plugin.id), ["text-tools", "image-tools"]);
});

test("creates safe, readable dependency path segments", () => {
  assert.equal(portableDependencySegment("도구 / files"), "도구-files");
  assert.equal(portableDependencySegment("///"), "dependency");
});

test("remaps imported workflow ids and their internal calls together", () => {
  const root = { id: "root", nodes: [{ type: "workflow", config: { calledWorkflowId: "child" } }] };
  const child = { id: "child", nodes: [{ type: "workflow", config: { calledWorkflowId: "external" } }] };
  let nextId = 0;
  const imported = remapPackagedWorkflowIds([root, child], () => `new-${++nextId}`);
  assert.equal(imported[0].id, "new-1");
  assert.equal(imported[1].id, "new-2");
  assert.equal(imported[0].nodes[0].config.calledWorkflowId, "new-2");
  assert.equal(imported[1].nodes[0].config.calledWorkflowId, "external");
});

test("keeps single-workflow JSON exports backward compatible", () => {
  const root = { id: "root", nodes: [] };
  assert.equal(createWorkflowJsonBundle([root]), root);
  assert.deepEqual(unpackWorkflowJsonBundle(root), [root]);
});

test("packs and unpacks dependent workflows in JSON exports", () => {
  const root = { id: "root", nodes: [{ type: "workflow", config: { calledWorkflowId: "child" } }] };
  const child = { id: "child", nodes: [] };
  const leaf = { id: "leaf", nodes: [] };
  const exported = createWorkflowJsonBundle([root, child, leaf]);

  assert.equal(exported.format, "magic-conch-workflow-bundle");
  assert.equal(exported.version, 1);
  assert.equal(exported.workflow, root);
  assert.deepEqual(exported.dependentWorkflows, [child, leaf]);
  assert.deepEqual(unpackWorkflowJsonBundle(exported), [root, child, leaf]);
});

test("rejects malformed workflow JSON bundle envelopes", () => {
  assert.throws(
    () => unpackWorkflowJsonBundle({ format: "magic-conch-workflow-bundle", version: 2, workflow: {}, dependentWorkflows: [] }),
    /invalid or unsupported/,
  );
});

test("finds runtime Load sources without including disconnected nodes", () => {
  const workflow = {
    nodes: [
      { id: "start", type: "start" },
      { id: "request", type: "request" },
      { id: "load-upstream", type: "load" },
      { id: "load-disconnected", type: "load" },
    ],
    edges: [
      { from: "start", to: "request" },
      { from: "load-upstream", to: "request" },
    ],
  };
  assert.deepEqual([...workflowRuntimeNodeIds(workflow)].sort(), ["load-upstream", "request", "start"]);
});

test("does not package disconnected workflow or plug-in dependencies", () => {
  const child = { id: "child", nodes: [{ id: "child-start", type: "start", config: {} }], edges: [] };
  const root = {
    id: "root",
    nodes: [
      { id: "start", type: "start", config: {} },
      { id: "end", type: "end", config: {} },
      { id: "unused-workflow", type: "workflow", config: { calledWorkflowId: "child" } },
      { id: "unused-plugin", type: "demo:unused", config: {} },
    ],
    edges: [{ from: "start", to: "end" }],
  };
  const bundled = collectWorkflowBundleDependencies(root, [root, child], [{ id: "demo", nodes: [{ type: "demo:unused" }] }]);
  assert.deepEqual(bundled.workflows.map((workflow) => workflow.id), ["root"]);
  assert.deepEqual(bundled.plugins, []);
});
