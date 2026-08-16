import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Magic Conch workflow editor", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Magic Conch — AI Workflow Studio<\/title>/i);
  assert.match(html, />Magic Conch</);
  assert.match(html, />\s*Workflow</);
  assert.match(html, /aria-label="Workflow connections"/);
  assert.doesNotMatch(html, /type-flow|edge-flow/);
});

test("uses typed data edges as concurrent workflow dependencies", async () => {
  const [workbench, css] = await Promise.all([
    readFile(new URL("../app/workbench.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(workbench, /type PortDataType = "prompt" \| "files"/);
  assert.doesNotMatch(workbench, /type PortDataType = [^;]*"flow"/);
  assert.match(workbench, /Promise\.all\(executable\.map/);
  assert.match(workbench, /predecessors\.every\(\(id\) => settled\.has\(id\)\)/);
  assert.match(workbench, /function migrateWorkflow/);
  assert.doesNotMatch(css, /\.type-flow|\.edge-flow/);
});

test("anchors workflow connections to the rendered port centers", async () => {
  const workbench = await readFile(new URL("../app/workbench.tsx", import.meta.url), "utf8");

  assert.match(workbench, /useLayoutEffect\(\(\) => \{/);
  assert.match(workbench, /querySelectorAll<HTMLElement>\("\[data-node-port-id\]"\)/);
  assert.match(workbench, /portRect\.left \+ portRect\.width \/ 2 - nodeRect\.left/);
  assert.match(workbench, /portRect\.top \+ portRect\.height \/ 2 - nodeRect\.top/);
  assert.match(workbench, /data-port-side="input"/);
  assert.match(workbench, /data-port-side="output"/);
  assert.doesNotMatch(workbench, /node\.y \+ 62 \+ index \* 25/);
});

test("uses Start node settings for the chat agent and opening message", async () => {
  const workbench = await readFile(new URL("../app/workbench.tsx", import.meta.url), "utf8");

  assert.match(workbench, /agentName\?: string/);
  assert.match(workbench, /startMessage\?: string/);
  assert.match(workbench, /function getStartSettings/);
  assert.match(workbench, />Agent name<input/);
  assert.match(workbench, />Start message<textarea/);
  assert.match(workbench, /meta: getStartSettings\(activeWorkflow, context\.syntax\)\.agentName/);
});

test("runs one workflow from another through the Use Workflow node", async () => {
  const workbench = await readFile(new URL("../app/workbench.tsx", import.meta.url), "utf8");

  assert.match(workbench, /workflow: \{ label: "Use Workflow", subtitle: "Run another workflow"/);
  assert.match(workbench, /if \(node\.type === "workflow"\) return \{ inputs: \[\{ id: "prompt"/);
  assert.match(workbench, /calledWorkflowId\?: string/);
  assert.match(workbench, /async function executeCalledWorkflow/);
  assert.match(workbench, /result: await executeGraphNode\(node, context, emitted, workflow\)/);
  assert.match(workbench, /Workflow recursion detected/);
  assert.match(workbench, /Reusable workflows must run from Start to End without requesting another message/);
  assert.match(workbench, />Select a workflow…<\/option>/);
});

test("supports scalar and media data ports, connectable attributes, and directory loading", async () => {
  const [workbench, css] = await Promise.all([
    readFile(new URL("../app/workbench.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  for (const type of ["string", "integer", "float", "image", "video", "audio"]) {
    assert.match(workbench, new RegExp(`PortDataType = [^;]*"${type}"`));
    assert.match(css, new RegExp(`\\.type-${type}`));
  }
  assert.match(workbench, /"list-directory": \{ label: "Load Directory"/);
  assert.match(workbench, /async function loadDirectoryFiles/);
  assert.match(workbench, /loadMode\?: "latest" \| "all" \| "exact" \| "folder"/);
  assert.match(workbench, /<option value="folder">All files in folder<\/option>/);
  assert.match(workbench, /node\.config\.loadMode === "folder"[\s\S]*?loadDirectoryFiles/);
  assert.match(workbench, /rememberDirectoryHandle\(nodeId, handle\)/);
  assert.match(workbench, /restoreDirectoryHandles\(\)/);
  assert.match(workbench, /rememberDirectoryHandle\(DATABASE_DIRECTORY_HANDLE_KEY, handle\)/);
  assert.match(workbench, /const DEFAULT_LOCAL_DIRECTORY = "user-data"/);
  assert.match(workbench, /operation: "save-record"/);
  assert.match(workbench, /operation: "load-record"/);
  assert.match(workbench, /operation: "list-files"/);
  assert.match(workbench, /magic-conch-default-directory/);
  assert.match(workbench, /Reconnect the “\$\{node\.config\.directoryName\}” Node directory/);
  assert.match(workbench, /Absolute paths work only when they contain the selected directory/);
  assert.match(workbench, /id: "system_prompt", label: "system prompt", type: "string"/);
  assert.match(workbench, /id: "start_message", label: "start message", type: "string"/);
  assert.match(workbench, /inputFor\("system_prompt", node\.config\.systemPrompt/);
  assert.match(workbench, /connectedConfiguredValue\(workflow, start\.id, "start_message"\)/);
  assert.match(workbench, /node\.type === "save"[^\n]+\.\.\.mediaInputs[^\n]+\.\.\.mediaOutputs/);
  assert.match(workbench, /node\.type === "load"[^\n]+\.\.\.mediaOutputs/);
  assert.match(workbench, /output\("image", mediaAssets\(loaded\.files, "image"\)\)/);
  assert.match(workbench, /output\("video", mediaAssets\(loaded\.files, "video"\)\)/);
  assert.match(workbench, /assets: !folder && !localResult && node\.config\.saveFiles !== "data" \? files : undefined/);
  assert.match(workbench, /fileAssetsPromptSections\(fileInput\)/);
  assert.match(workbench, /collectFileAssets\(suppliedFiles, suppliedMedia, documentInput\)/);
  assert.match(workbench, /files: fileInput/);
});

test("renders chat messages as GitHub-flavored Markdown", async () => {
  const [workbench, css] = await Promise.all([
    readFile(new URL("../app/workbench.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(workbench, /<ReactMarkdown remarkPlugins=\{\[remarkGfm\]\}>\{message\.text\}<\/ReactMarkdown>/);
  assert.match(workbench, /className="message-bubble message-markdown"/);
  assert.match(css, /\.message-markdown pre/);
  assert.match(css, /\.message-markdown table/);
});

test("groups locally saved chats into manageable folders", async () => {
  const [workbench, css] = await Promise.all([
    readFile(new URL("../app/workbench.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(workbench, /type ChatFolder =/);
  assert.match(workbench, /magic-conch-chat-folders/);
  assert.match(workbench, /aria-label="Create chat folder"/);
  assert.match(workbench, /function moveChatSession/);
  assert.match(workbench, /readStoredChatSessions/);
  assert.match(workbench, /writeStoredChatSessions\(chatSessions\)/);
  assert.doesNotMatch(workbench, /localStorage\.setItem\("magic-conch-chat-sessions", JSON\.stringify\(chatSessions\)\)/);
  assert.match(workbench, /Folder removed; its chats were kept/);
  assert.match(css, /\.chat-folder-heading/);
  assert.match(css, /\.session-folder-menu/);
});

test("searches and groups the Workflow node library", async () => {
  const [workbench, css] = await Promise.all([
    readFile(new URL("../app/workbench.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(workbench, /const BUILTIN_NODE_GROUPS/);
  assert.match(workbench, /aria-label="Search nodes by name"/);
  assert.match(workbench, /label\.toLocaleLowerCase\(\)\.includes\(query\)/);
  assert.match(workbench, /aria-expanded=\{isOpen\}/);
  assert.match(workbench, /plugin-\$\{plugin\.id\}/);
  assert.match(css, /\.node-search:focus-within/);
  assert.match(css, /\.node-group-toggle\.collapsed/);
});

test("keeps the application responsive when the browser viewport changes with page zoom", async () => {
  const [workbench, css] = await Promise.all([
    readFile(new URL("../app/workbench.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(workbench, /if \(event\.ctrlKey \|\| event\.metaKey\) return;/);
  assert.match(css, /\.app-shell \{[^}]*height: 100dvh;[^}]*min-height: 0;/);
  assert.match(css, /\.workflow-view \{[^}]*height: calc\(100dvh - 70px\);[^}]*min-height: 0;/);
  assert.match(css, /\.chat-view \{[^}]*height: calc\(100dvh - 70px\);[^}]*min-height: 0;/);
  assert.match(css, /\.workflow-sidebar, \.chat-sidebar \{[^}]*min-height: 0;/);
  assert.match(css, /\.workflow-main \{[^}]*min-width: 0;[^}]*min-height: 0;/);
  assert.match(css, /@media \(max-width: 980px\)/);
  assert.doesNotMatch(css, /\.app-shell \{[^}]*min-height: (?:560|650)px;/);
});
