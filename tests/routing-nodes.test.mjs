import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { evaluateBooleanRule } from "../lib/boolean-condition.ts";
import { collectFileAssets, fileAssetsPromptSections } from "../lib/file-content.ts";

// Run the real editor and executor functions with UI/provider side effects stubbed.
// This catches regressions spanning connection editing and runtime route selection.
const source = readFileSync(new URL("../app/workbench.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("workbench.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ["getNodeSchema", "evaluateRouteRule", "executeGraphNode", "connectTo"];
const functions = new Map();
function visit(node) {
  if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) functions.set(node.name.text, node.getText(tree));
  ts.forEachChild(node, visit);
}
visit(tree);
assert.equal(functions.size, names.length);
const compiled = ts.transpileModule([...functions.values()].join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function harness(type, routeMethod = "equals") {
  const options = [
    { id: "urgent", label: "Urgent", value: "urgent" },
    { id: "fallback", label: "Other", value: "" },
  ];
  let sequence = 0;
  let request;
  const sandbox = vm.createContext({
    evaluateBooleanRule, collectFileAssets, fileAssetsPromptSections,
    plugins: [], providerSettings: {}, modelDefaults: { openai: "test-model" },
    activeWorkflow: {
      nodes: [
        { id: "router", type, name: type, config: { routeMethod, routeOptions: options } },
        { id: "worker", type: "request", config: {} },
      ],
      edges: [],
    },
    expandWorkflowSyntaxInValue: value => value,
    portValueKey: (id, port) => `${id}:${port}`,
    isBuiltinNodeType: () => true,
    addDebugEvent: () => "test", updateDebugEvent: () => {},
    openAIRequestSettings: () => undefined,
    requestAI: async value => { request = value; return "2"; },
    connectRef: { current: null }, connectionSource: null,
    portsCompatible: () => true, showToast: () => {},
    setConnectionSource: () => {}, setConnectionDraft: () => {},
    uid: prefix => `${prefix}-test-${++sequence}`,
  });
  sandbox.updateWorkflow = updater => { sandbox.activeWorkflow = updater(sandbox.activeWorkflow); };
  vm.runInContext(compiled, sandbox);
  return {
    get workflow() { return sandbox.activeWorkflow; },
    get request() { return request; },
    connect(port) {
      sandbox.connectRef.current = { nodeId: "router", portId: port, dataType: "prompt" };
      sandbox.connectTo("worker", "prompt", "prompt");
    },
    async run(prompt) {
      const context = { userMessage: prompt, files: [], values: {}, syntax: {} };
      const result = await sandbox.executeGraphNode(sandbox.activeWorkflow.nodes[0], context, new Set(), sandbox.activeWorkflow);
      return Object.fromEntries(result.emittedPortKeys.map(key => [key, context.values[key]]));
    },
  };
}

for (const method of ["contains", "equals", "regex", "number_gt"]) {
  test(`connecting Rule Router fallback preserves the destination for ${method}`, async () => {
    const editor = harness("router-rule", method);
    editor.connect("fallback");
    assert.deepEqual(await editor.run("ordinary request"), { "router:fallback": "ordinary request" });
    assert.equal(editor.workflow.nodes[0].config.routeOptions.length, 2);
    assert.equal(editor.workflow.edges[0].fromPort, "fallback");
  });
}

test("connecting an earlier route preserves matching and fallback destinations", async () => {
  const editor = harness("router-rule");
  editor.connect("urgent");
  assert.deepEqual(await editor.run("URGENT"), { "router:urgent": "URGENT" });
  assert.deepEqual(await editor.run("ordinary request"), { "router:fallback": "ordinary request" });
});

test("connecting AI Router's last option does not create an unwired classifier choice", async () => {
  const editor = harness("router-ai");
  editor.connect("fallback");
  assert.deepEqual(await editor.run("original prompt"), { "router:fallback": "original prompt" });
  assert.match(editor.request.systemPrompt, /from 1 to 2\./);
  assert.doesNotMatch(editor.request.prompt, /3\. Option 3/);
  assert.equal(editor.workflow.nodes[0].config.routeOptions.length, 2);
});

test("AI Work Assigner still grows its outputs when the final output is connected", () => {
  const editor = harness("ai-assigner");
  editor.connect("fallback");
  assert.equal(editor.workflow.nodes[0].config.routeOptions.length, 3);
  assert.equal(editor.workflow.edges[0].fromPort, "fallback");
});
