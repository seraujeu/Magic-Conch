import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { artifactFallbackJson } from "../lib/artifact-storage.ts";
import { chatSessionsFallbackJson } from "../lib/chat-storage.ts";
import { recoverStoredArray } from "../lib/storage-recovery.ts";
import { workbenchAst, compileWorkbenchSnippet } from "./helpers/workbench-runtime.mjs";

function storageEffect(marker) {
  let callback;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(workbenchAst) === "useEffect"
      && node.arguments[0]?.getText(workbenchAst).includes(marker)) {
      assert.equal(callback, undefined, `Ambiguous storage effect: ${marker}`);
      callback = node.arguments[0];
    }
    ts.forEachChild(node, visit);
  }
  visit(workbenchAst);
  assert.ok(callback, `Missing production storage effect: ${marker}`);
  return compileWorkbenchSnippet(`globalThis.effect = ${callback.getText(workbenchAst)};`);
}

function storageRuntime({ failWrites = true } = {}) {
  const local = new Map();
  const indexed = {
    workflows: [{ id: "flow", name: "Old workflow", nodes: [], edges: [] }],
    plugins: [{ id: "plugin", name: "Old plugin", nodes: [] }],
    sessions: [{ id: "chat", workflowId: "flow", messages: [{ role: "user", text: "Old message" }] }],
  };
  const restored = {};
  const timers = [];
  const writes = [];
  const context = vm.createContext({
    recoverStoredArray, artifactFallbackJson, chatSessionsFallbackJson,
    configuredGoogleDriveClientId: "",
    storageRestoredRef: { current: true },
    artifactStorageWarningShownRef: { current: false },
    storageWarningShownRef: { current: false },
    workflows: [{ id: "flow", name: "New workflow", nodes: [], edges: [] }],
    plugins: [{ id: "plugin", name: "New plugin", nodes: [] }],
    chatSessions: [{ id: "chat", workflowId: "flow", messages: [{ role: "user", text: "New message" }] }],
    activeSessionId: "chat",
    localStorage: {
      getItem: (key) => local.get(key) ?? null,
      setItem: (key, value) => local.set(key, value),
      removeItem: (key) => local.delete(key),
    },
    window: {
      setTimeout: (callback) => { timers.push(callback); return timers.length; },
      clearTimeout() {},
    },
    readStoredArtifact: async (key) => structuredClone(indexed[key]),
    readStoredChatSessions: async () => structuredClone(indexed.sessions),
    writeStoredArtifact: async (key, value) => {
      writes.push({ key, value });
      if (failWrites) throw new DOMException("Quota exceeded", "QuotaExceededError");
      indexed[key] = structuredClone(value);
    },
    writeStoredChatSessions: async (value) => {
      writes.push({ key: "sessions", value });
      if (failWrites) throw new DOMException("Quota exceeded", "QuotaExceededError");
      indexed.sessions = structuredClone(value);
    },
    migrateWorkflow: (workflow) => workflow,
    materializeWorkflowLoadFiles: async (workflow) => workflow,
    setWorkflows: (value) => { restored.workflows = value; },
    setPlugins: (value) => { restored.plugins = value; },
    setChatSessions: (value) => { restored.sessions = value; },
    setActiveWorkflowId() {}, setActiveSessionId() {}, setMessages() {},
    setAutomaticWorkflowParallelism() {},
    showToast: (message) => { restored.toast = message; },
  });
  async function runEffect(marker) {
    vm.runInContext(storageEffect(marker), context);
    context.effect();
    while (timers.length) await timers.shift()();
    await new Promise((resolve) => setImmediate(resolve));
  }
  return { local, indexed, restored, writes, runEffect };
}

test("failed production saves restore newer fallback workflows, plugins, and chat text", async () => {
  const runtime = storageRuntime();
  await runtime.runEffect('writeStoredArtifact("workflows", workflows)');
  await runtime.runEffect('writeStoredArtifact("plugins", plugins)');
  await runtime.runEffect("writeStoredChatSessions(chatSessions)");
  assert.equal(JSON.parse(runtime.local.get("magic-conch-workflows"))[0].name, "New workflow");
  assert.equal(JSON.parse(runtime.local.get("magic-conch-plugins"))[0].name, "New plugin");
  assert.equal(JSON.parse(runtime.local.get("magic-conch-chat-sessions"))[0].messages[0].text, "New message");

  await runtime.runEffect("const savedFlowsJson");
  assert.equal(runtime.restored.workflows[0].name, "New workflow");
  assert.equal(runtime.restored.plugins[0].name, "New plugin");
  assert.equal(runtime.restored.sessions[0].messages[0].text, "New message");
  for (const key of ["workflows", "plugins", "chat-sessions"]) {
    assert.ok(runtime.local.has(`magic-conch-${key}`), "Keep the fallback while IndexedDB still cannot save");
  }
});

test("recovery commits the selected fallback before removing it", async () => {
  const runtime = storageRuntime({ failWrites: false });
  runtime.local.set("magic-conch-workflows", JSON.stringify([{ id: "flow", name: "Recovered workflow", nodes: [], edges: [] }]));
  runtime.local.set("magic-conch-plugins", JSON.stringify([]));
  runtime.local.set("magic-conch-chat-sessions", JSON.stringify([{ id: "chat", workflowId: "flow", messages: [{ text: "Recovered message" }] }]));
  await runtime.runEffect("const savedFlowsJson");
  assert.equal(runtime.indexed.workflows[0].name, "Recovered workflow");
  assert.equal(runtime.indexed.plugins.length, 0, "An empty fallback preserves plugin deletion");
  assert.equal(runtime.indexed.sessions[0].messages[0].text, "Recovered message");
  for (const key of ["workflows", "plugins", "chat-sessions"]) assert.equal(runtime.local.has(`magic-conch-${key}`), false);
});

test("malformed fallback copies do not hide valid committed browser state", async () => {
  const runtime = storageRuntime();
  runtime.local.set("magic-conch-workflows", "{broken");
  runtime.local.set("magic-conch-plugins", JSON.stringify({ invalid: "not an array" }));
  runtime.local.set("magic-conch-chat-sessions", "null");
  await runtime.runEffect("const savedFlowsJson");
  assert.equal(runtime.restored.workflows[0].name, "Old workflow");
  assert.equal(runtime.restored.plugins[0].name, "Old plugin");
  assert.equal(runtime.restored.sessions[0].messages[0].text, "Old message");
  assert.equal(runtime.restored.toast, undefined);
});
