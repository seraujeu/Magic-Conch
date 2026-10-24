import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { collectFileAssets, fileAssetsPromptSections } from "../lib/file-content.ts";
import { expandWorkflowSyntax } from "../lib/workflow-syntax.ts";
import {
  createWorkflowTaskLimiter,
  createWorkflowResourceLimiter,
  mapWithConcurrencyLimit,
  isWorkflowNodeActive,
} from "../lib/workflow-scheduler.ts";
import {
  buildWorkflowAssistantRequest,
  buildWorkflowAssistantSystemPrompt,
  normalizeWorkflowAssistantFanIn,
  parseWorkflowAssistantResponse,
  validateWorkflowAssistantGraph,
} from "../lib/workflow-assistant.ts";
import { compileWorkbenchSnippet, createWorkbenchRuntime, findWorkbenchNodes, workbenchAst } from "./helpers/workbench-runtime.mjs";

const plain = (value) => JSON.parse(JSON.stringify(value));
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const node = (id, type, config = {}) => ({ id, type, name: id, x: 0, y: 0, config });
const workflow = (nodes, edges = []) => ({ id: "workflow-a", name: "A", version: 4, nodes, edges });
const edge = (from, fromPort, to, toPort) => ({ id: `${from}-${to}`, from, fromPort, to, toPort, dataType: "prompt" });

function bindState(context) {
  for (const key of ["messages", "chatSessions", "activeSessionId", "activeWorkflowId", "pendingInput", "isRunning", "messageInput", "attachedFiles", "debugEvents", "editingMessage", "moveMenuSessionId", "selectedNodeId", "selectedNodeIds", "pan"]) {
    const setter = `set${key[0].toUpperCase()}${key.slice(1)}`;
    context[setter] = (value) => { context[key] = typeof value === "function" ? value(context[key]) : value; };
  }
  context.setWorkflows = (value) => {
    context.workflows = typeof value === "function" ? value(context.workflows) : value;
    if (context.workflowsRef) context.workflowsRef.current = context.workflows;
  };
}

const graphFunctions = ["getNodeSchema", "portValueKey", "stringifyValue", "executeGraphNode", "parseStructuredText", "openAIRequestSettings", "isBuiltinNodeType"];

function graphRuntime(functions = [], globals = {}) {
  const context = createWorkbenchRuntime([...graphFunctions, ...functions], {
    plugins: [],
    NODE_META: { start: {}, end: {}, input: {}, request: {}, parser: {}, wait: {} },
    modelDefaults: { openai: "test-model" },
    providerSettings: {},
    collectFileAssets,
    fileAssetsPromptSections,
    expandWorkflowSyntaxInValue: (value) => value,
    mediaAssets: (files, kind) => files.filter((file) => file.type.startsWith(`${kind}/`)),
    isDocumentAsset: (file) => !/^(?:image|video|audio)\//.test(file.type),
    lines: () => undefined,
    addDebugEvent: () => "debug",
    updateDebugEvent() {},
    getStartSettings: () => ({ agentName: "A agent" }),
    mapWithConcurrencyLimit,
    isWorkflowNodeActive,
    workflowParallelismRef: { current: 4 },
    isRunningRef: { current: false },
    chatUndoRef: { current: [] },
    chatRedoRef: { current: [] },
    messages: [],
    attachedFiles: [],
    debugEvents: [],
    pendingInput: null,
    isRunning: false,
    uid: (() => { let id = 0; return () => `test-${++id}`; })(),
    timeNow: () => "12:00",
    showToast() {},
    ...globals,
  });
  bindState(context);
  return context;
}

function runContext(values = {}) {
  return {
    userMessage: "initial request", files: [], values, syntax: {
      now: new Date("2026-10-05T12:00:00Z"), chatSessionNumber: 1,
      chatSessionId: "A", chatSessionTitle: "A", workflowName: "A",
    },
    executionLimiter: createWorkflowTaskLimiter(4),
    fileProcessingLimiter: createWorkflowResourceLimiter(),
  };
}

test("Input replies clone mutable run data, preserve runtime services, and resume the paused graph after edits", async () => {
  const graph = workflow([node("start", "start", { agentName: "Paused agent" }), node("input", "input", { prompt: "Your answer?" }), node("end", "end")], [edge("start", "prompt", "input", "prompt"), edge("input", "prompt", "end", "prompt")]);
  const context = graphRuntime(["runWorkflow", "clonePendingWorkflowInput", "currentChatSnapshot", "rememberChat", "setWorkflowRunning", "sendMessage", "undoChat", "reportWorkflowRunError", "getStartSettings", "connectedConfiguredValue"], {
    activeWorkflow: graph, expandWorkflowSyntax, DEFAULT_START_MESSAGE: "Welcome", DEFAULT_AGENT_NAME: "Default agent",
  });
  context.executeScheduledGraphNode = (...args) => context.executeGraphNode(...args);
  const originalContext = runContext({ "start:prompt": "initial request" });
  await context.runWorkflow(originalContext, { completedNodeIds: ["start"], skippedNodeIds: [], emittedPortKeys: ["start:prompt"], endResults: [] });
  assert.equal(context.pendingInput.nodeId, "input");
  assert.equal(context.messages.at(-1).meta, "Paused agent");
  const originalLimiter = originalContext.executionLimiter;
  const snapshot = context.currentChatSnapshot();
  assert.equal(snapshot.pendingInput.context.executionLimiter, originalLimiter);
  assert.notEqual(snapshot.pendingInput.context.values, originalContext.values);
  context.activeWorkflow = workflow([node("different-start", "start", { agentName: "Other agent" })]);
  context.messageInput = "첫 답변 🌊";
  await context.sendMessage();
  assert.equal(context.messages.at(-1).text, "첫 답변 🌊");
  assert.equal(context.messages.at(-1).meta, "Paused agent");
  assert.equal(context.pendingInput, null);
  assert.equal(context.chatUndoRef.current[0].pendingInput.context.values["input:prompt"], undefined);
  context.undoChat();
  assert.equal(context.pendingInput.nodeId, "input");
  assert.equal(context.pendingInput.context.executionLimiter, originalLimiter);
  context.messageInput = "A different answer";
  await context.sendMessage();
  assert.equal(context.messages.at(-1).text, "A different answer");
  assert.equal(context.messages.at(-1).meta, "Paused agent");
});

test("parallel Requests keep each node's answer and generated file while another Request completes", async () => {
  const fileStarted = deferred();
  const releaseFile = deferred();
  const context = graphRuntime([], {
    activeWorkflow: workflow([node("a", "request"), node("b", "request")]),
    requestAI: async ({ model }) => `${model} answer`,
    readFileAsset: async (file) => {
      if (file.name === "a.txt") { fileStarted.resolve(); await releaseFile.promise; }
      const bytes = Buffer.from(await file.arrayBuffer());
      return { name: file.name, type: file.type, size: file.size, data: `data:${file.type};base64,${bytes.toString("base64")}` };
    },
  });
  const data = runContext();
  const a = context.executeGraphNode(node("a", "request", { model: "A", outputFileName: "a.txt" }), data, new Set());
  await fileStarted.promise;
  await context.executeGraphNode(node("b", "request", { model: "B", outputFileName: "b.txt" }), data, new Set());
  releaseFile.resolve();
  await a;
  assert.equal(data.values["a:prompt"], "A answer");
  assert.equal(data.values["b:prompt"], "B answer");
  for (const [id, expected] of [["a", "A answer"], ["b", "B answer"]]) {
    const file = data.values[`${id}:files`][0];
    assert.equal(Buffer.from(file.data.split(",")[1], "base64").toString("utf8"), expected);
  }
});

test("session and workflow replacement actions cannot move an in-flight run into another conversation", async () => {
  const started = deferred();
  const release = deferred();
  const graph = workflow([node("start", "start"), node("wait", "wait"), node("end", "end")], [edge("start", "prompt", "wait", "value"), edge("wait", "value", "end", "prompt")]);
  const sessionA = { id: "A", workflowId: graph.id, title: "A", messages: [{ id: "user", role: "user", text: "A request" }] };
  const sessionB = { id: "B", workflowId: "workflow-b", title: "B", messages: [{ id: "welcome", role: "assistant", text: "B welcome" }] };
  const context = graphRuntime(["runWorkflow", "setWorkflowRunning", "canChangeConversation", "createChatSession", "selectChatSession", "duplicateChatSession", "deleteChatSession", "switchWorkflow", "newWorkflow", "duplicateWorkflow", "deleteWorkflow", "importWorkflowFile"], {
    activeWorkflow: graph, activeWorkflowId: graph.id, workflows: [graph],
    chatSessions: [sessionA, sessionB], activeSessionId: "A", messages: sessionA.messages,
    isRunning: true, isRunningRef: { current: true },
  });
  context.executeScheduledGraphNode = async (item) => {
    if (item.id === "wait") { started.resolve(); await release.promise; return { emittedPortKeys: ["wait:value"] }; }
    return { emittedPortKeys: [], endResult: { text: "A result", files: [] } };
  };
  const running = context.runWorkflow(runContext(), { completedNodeIds: ["start"], skippedNodeIds: [], emittedPortKeys: ["start:prompt"], endResults: [] });
  await started.promise;
  context.selectChatSession("B");
  context.createChatSession();
  context.duplicateChatSession("B");
  context.deleteChatSession("A");
  context.switchWorkflow("workflow-b");
  context.newWorkflow();
  context.duplicateWorkflow(graph.id);
  context.deleteWorkflow(graph.id);
  assert.equal(await context.importWorkflowFile(new File(["{}"], "workflow.json")), null);
  assert.equal(context.activeSessionId, "A");
  assert.equal(context.activeWorkflowId, graph.id);
  assert.equal(context.chatSessions.length, 2);
  release.resolve();
  await running;
  assert.deepEqual(plain(context.messages.map((message) => message.text)), ["A request", "A result"]);
  assert.equal(context.isRunningRef.current, false);
  context.selectChatSession("B");
  assert.equal(context.activeSessionId, "B");
  assert.deepEqual(plain(context.messages.map((message) => message.text)), ["B welcome"]);
});

test("deleting the active chat resets Undo and Redo, while deleting another chat keeps the current continuation", () => {
  const context = graphRuntime(["canChangeConversation", "deleteChatSession", "currentChatSnapshot", "clonePendingWorkflowInput", "undoChat"], {
    activeSessionId: "A", messages: [{ id: "a", text: "A" }],
    chatSessions: [{ id: "A", messages: [{ id: "a", text: "A" }] }, { id: "B", messages: [{ id: "b", text: "B" }], workflowId: "workflow-b" }],
    chatUndoRef: { current: [{ messages: [{ id: "older-a", text: "Older A" }], pendingInput: null }] },
    chatRedoRef: { current: [{ messages: [{ id: "redo-a", text: "Redo A" }], pendingInput: null }] },
  });
  context.deleteChatSession("A");
  context.undoChat();
  assert.equal(context.activeSessionId, "B");
  assert.deepEqual(plain(context.messages.map((message) => message.text)), ["B"]);
  assert.equal(context.chatUndoRef.current.length, 0);
  assert.equal(context.chatRedoRef.current.length, 0);
  const pending = { nodeId: "input" };
  context.pendingInput = pending;
  context.chatUndoRef.current.push({ messages: [], pendingInput: null });
  context.chatSessions.push({ id: "C", messages: [] });
  context.deleteChatSession("C");
  assert.equal(context.pendingInput, pending);
  assert.equal(context.chatUndoRef.current.length, 1);
});

test("a paused Input can be abandoned by changing chats", () => {
  const context = graphRuntime(["canChangeConversation", "selectChatSession"], {
    activeSessionId: "A", pendingInput: { nodeId: "input" },
    chatSessions: [{ id: "A", messages: [] }, { id: "B", workflowId: "workflow-b", messages: [{ id: "b", text: "B" }] }],
  });
  context.selectChatSession("B");
  assert.equal(context.activeSessionId, "B");
  assert.equal(context.pendingInput, null);
  assert.deepEqual(plain(context.messages.map((message) => message.text)), ["B"]);
});

test("workflow imports recheck the run guard after asynchronously reading a file", async () => {
  const reading = deferred();
  const release = deferred();
  const original = workflow([node("start", "start"), node("end", "end")]);
  const context = graphRuntime(["canChangeConversation", "importWorkflowFile"], {
    workflows: [original], activeWorkflowId: original.id,
    isZipFile: () => false,
    workflowFileText: (text) => text,
    unpackWorkflowJsonBundle: (value) => [value],
    remapPackagedWorkflowIds: (graphs) => graphs,
    migrateWorkflow: (graph) => graph,
    materializeWorkflowLoadFiles: async (graph) => graph,
  });
  const importing = context.importWorkflowFile({
    async text() { reading.resolve(); await release.promise; return JSON.stringify(original); },
  });
  await reading.promise;
  context.isRunningRef.current = true;
  release.resolve();
  assert.equal(await importing, null);
  assert.equal(context.workflows.length, 1);
  assert.equal(context.activeWorkflowId, original.id);
});

test("Parser reads UTF-8 JSON documents from base64 and percent-encoded data URLs", async () => {
  const text = JSON.stringify({ greeting: "안녕하세요", symbol: "🌊", punctuation: "a,b" });
  for (const dataUrl of [`data:application/json;base64,${Buffer.from(text).toString("base64")}`, `data:application/json,${encodeURIComponent(text)}`]) {
    const parser = node("parser", "parser", { parserFormat: "json" });
    const graph = workflow([parser], [edge("document", "document", "parser", "document")]);
    const context = graphRuntime([], { activeWorkflow: graph });
    const data = runContext({ "document:document": { name: "unicode.json", type: "application/json", size: Buffer.byteLength(text), data: dataUrl } });
    await context.executeGraphNode(parser, data, new Set(["document:document"]));
    assert.equal(data.values["parser:text"], text);
    assert.deepEqual(plain(data.values["parser:data"]), JSON.parse(text));
  }
});

test("Delete on a focused connection stops before the global selected-node shortcut", () => {
  const graph = workflow([node("selected", "request")], [{ id: "focused-edge", from: "start", to: "selected" }]);
  const context = createWorkbenchRuntime(["removeEdge", "handleWorkflowShortcut"], {
    tab: "workflow", settingsOpen: false, activeWorkflow: graph, workflows: [graph], activeWorkflowId: graph.id,
    selectedNodeId: "selected", selectedNodeIds: ["selected"], undoLimit: 50,
    undoHistoryRef: { current: {} }, redoHistoryRef: { current: {} }, showToast() {}, edge: graph.edges[0],
  });
  bindState(context);
  context.updateWorkflow = (updater) => { context.workflows = context.workflows.map(updater); };
  const [attribute] = findWorkbenchNodes((item) => ts.isJsxAttribute(item) && item.name.getText(workbenchAst) === "onKeyDown" && item.initializer?.getText(workbenchAst).includes("removeEdge(edge.id)"));
  vm.runInContext(compileWorkbenchSnippet(`var connectionKeyHandler = ${attribute.initializer.expression.getText(workbenchAst)}`), context);
  let stopped = false;
  const event = { key: "Delete", target: { matches: () => false }, preventDefault() {}, stopPropagation() { stopped = true; } };
  context.connectionKeyHandler(event);
  if (!stopped) context.handleWorkflowShortcut(event);
  assert.equal(stopped, true);
  assert.equal(context.workflows[0].nodes.length, 1);
  assert.equal(context.workflows[0].edges.length, 0);
});

test("an AI workflow response cannot overwrite manual edits made while the model was responding", async () => {
  const started = deferred();
  const release = deferred();
  const original = workflow([node("start", "start"), node("end", "end")], [edge("start", "prompt", "end", "prompt")]);
  const context = createWorkbenchRuntime(["runWorkflowAssistant", "workflowJsonManifest", "validateAssistantWorkflow", "getNodeSchema", "portsCompatible"], {
    activeWorkflow: original, workflowsRef: { current: [original] }, activeWorkflowIdRef: { current: original.id },
    workflowAssistantRequest: "Change description", workflowAssistantModel: "fake", workflowAssistantProvider: "openai",
    providerSettings: {}, plugins: [], NODE_META: { start: {}, end: {} },
    nodeReference: "node guide", vibeCodingWorkflow: "workflow guide", workflowSyntaxInstructions: "syntax guide",
    buildWorkflowAssistantRequest, buildWorkflowAssistantSystemPrompt, normalizeWorkflowAssistantFanIn, parseWorkflowAssistantResponse, validateWorkflowAssistantGraph,
    requestAI: async () => { started.resolve(); await release.promise; return JSON.stringify({ ...original, description: "AI edit" }); },
    setWorkflowAssistantRunning() {}, setWorkflowAssistantStatus(value) { context.status = value; },
    setSelectedNodeId() {}, setSelectedNodeIds() {}, setWorkflowAssistantRequest() {}, showToast() {},
    updateWorkflow(updater) { context.applied = updater(context.workflowsRef.current[0]); },
  });
  const editing = context.runWorkflowAssistant();
  await started.promise;
  const manual = structuredClone(original);
  manual.nodes[0].config.startMessage = "My manual edit";
  context.workflowsRef.current = [manual];
  release.resolve();
  await editing;
  assert.equal(context.applied, undefined);
  assert.equal(context.workflowsRef.current[0].nodes[0].config.startMessage, "My manual edit");
  assert.equal(context.status.kind, "error");
  assert.match(context.status.message, /workflow changed.*changes were kept/i);
  context.activeWorkflow = manual;
  context.requestAI = async () => JSON.stringify({ ...manual, description: "Fresh AI edit" });
  await context.runWorkflowAssistant();
  assert.equal(context.status.kind, "success");
  assert.equal(context.applied.description, "Fresh AI edit");
  assert.equal(context.applied.nodes[0].config.startMessage, "My manual edit");
});
