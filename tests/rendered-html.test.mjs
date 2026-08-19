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
  assert.match(html, />\s*Export with files\s*</);
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
  assert.match(workbench, /mapWithConcurrencyLimit\(executable, \(\) => workflowParallelismRef\.current/);
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

test("lets Start nodes select detailed chat, file, and session inputs", async () => {
  const [workbench, startInputs] = await Promise.all([
    readFile(new URL("../app/workbench.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/start-inputs.ts", import.meta.url), "utf8"),
  ]);

  assert.match(workbench, />Current user message</);
  assert.match(workbench, />Previous user messages</);
  assert.match(workbench, />Assistant messages</);
  assert.match(workbench, />System messages</);
  assert.match(workbench, />Current message attachments</);
  assert.match(workbench, />Attachments from earlier messages</);
  assert.doesNotMatch(workbench, />Files saved with the workflow</);
  assert.match(workbench, />Chat title, number, and session ID</);
  assert.match(workbench, />Workflow name and description</);
  assert.match(workbench, />Run date and time</);
  assert.match(workbench, /Provider keys and private connection settings are never included/);
  assert.match(workbench, /composeStartInputs/);
  assert.match(startInputs, /Conversation history:/);
  assert.match(startInputs, /startHistoryLimit \?\? 20/);
  assert.doesNotMatch(startInputs, /startIncludeWorkflowFiles/);
});

test("removes workflow attachments while keeping ZIP Load snapshots", async () => {
  const [workbench, loadBundle] = await Promise.all([
    readFile(new URL("../app/workbench.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/workflow-load-bundle.ts", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(workbench, /workflowAssetInputRef|addWorkflowFiles|workflowInputFiles/);
  assert.match(workbench, /function workflowJsonManifest/);
  assert.match(workbench, /delete manifest\.files/);
  assert.match(workbench, /captureWorkflowLoadFiles/);
  assert.match(workbench, /Export with files/);
  assert.match(loadBundle, /snapshot\.files\.map\(\(file\) => \(\{ \.\.\.file, bundleLoadNodeId: nodeId \}\)\)/);
});

test("provides a Chat Session source node with typed history and metadata outputs", async () => {
  const [workbench, loader] = await Promise.all([
    readFile(new URL("../app/workbench.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/chat-session-node.ts", import.meta.url), "utf8"),
  ]);

  assert.match(workbench, /"chat-session": \{ label: "Chat Session"/);
  assert.match(workbench, /id: "history", label: "history", type: "prompt"/);
  assert.match(workbench, /id: "messages", label: "messages", type: "any"/);
  assert.match(workbench, /id: "session_id", label: "session ID", type: "string"/);
  assert.match(workbench, /id: "message_count", label: "message count", type: "integer"/);
  assert.match(workbench, />Expose attachments from selected messages</);
  assert.match(workbench, /loadChatSession\(node\.config, context\.chatSession\)/);
  assert.match(loader, /totalPreviousMessageCount/);
});

test("offers guided OCR languages and selectable local or AI vision engines", async () => {
  const [workbench, ocr, ocrBrowser] = await Promise.all([
    readFile(new URL("../app/workbench.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/ocr.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/ocr-browser.ts", import.meta.url), "utf8"),
  ]);

  assert.match(workbench, />OCR engine</);
  assert.match(workbench, />Tesseract\.js — on device</);
  assert.match(workbench, />OpenAI vision</);
  assert.match(workbench, />Google Gemini vision</);
  assert.match(workbench, />Anthropic Claude vision</);
  assert.match(workbench, />Ollama vision — local model</);
  assert.match(workbench, />Primary language</);
  assert.match(workbench, />Additional languages</);
  assert.match(workbench, /await import\("\.\.\/lib\/ocr-browser"\)/);
  assert.match(ocr, /OCR_LANGUAGE_OPTIONS/);
  assert.match(ocr, /visionOcrPrompt/);
  assert.doesNotMatch(ocr, /import\("(?:pdfjs-dist|tesseract\.js)/);
  assert.doesNotMatch(ocr, /document\.createElement|typeof window/);
  assert.match(ocrBrowser, /^"use client";/);
  assert.match(ocrBrowser, /typeof window === "undefined"/);
  assert.match(ocrBrowser, /import\("pdfjs-dist\/build\/pdf\.worker\.min\.mjs\?url"\)/);
});

test("runs one workflow from another through the Use Workflow node", async () => {
  const workbench = await readFile(new URL("../app/workbench.tsx", import.meta.url), "utf8");

  assert.match(workbench, /workflow: \{ label: "Use Workflow", subtitle: "Run another workflow"/);
  assert.match(workbench, /if \(node\.type === "workflow"\) return \{ inputs: \[\{ id: "prompt"/);
  assert.match(workbench, /calledWorkflowId\?: string/);
  assert.match(workbench, /async function executeCalledWorkflow/);
  assert.match(workbench, /result: await executeScheduledGraphNode\(node, context, emitted, workflow\)/);
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
  assert.match(workbench, /restoreDirectoryHandles\(\)/);
  assert.match(workbench, /const DEFAULT_LOCAL_DIRECTORY = "user-data"/);
  assert.match(workbench, /operation: "save-record"/);
  assert.match(workbench, /operation: "load-record"/);
  assert.match(workbench, /operation: "list-files"/);
  assert.match(workbench, /operation: "materialize-load"/);
  assert.match(workbench, /materializedLoadDirectory\(workflow, node\)/);
  assert.match(workbench, /directoryPath: directory/);
  assert.match(workbench, /for \(const workflow of migrated\) materialized\.push\(await materializeWorkflowLoadFiles\(workflow\)\)/);
  assert.match(workbench, /for \(const workflow of migrated\) imported\.push\(await materializeWorkflowLoadFiles\(workflow\)\)/);
  assert.match(workbench, /magic-conch-default-directory/);
  assert.match(workbench, /directoryPath\?: string/);
  assert.match(workbench, /resolveNodeDirectory\(node\.config, configuredDefaultDirectory\(\), subfolder\)/);
  assert.match(workbench, /directory: location\.directory/);
  assert.match(workbench, /No browser permission is required/);
  assert.doesNotMatch(workbench, /chooseFolder\("node"/);
  assert.doesNotMatch(workbench, /ensureDirectoryPermission/);
  assert.match(workbench, /id: "system_prompt", label: "system prompt", type: "string"/);
  assert.match(workbench, /id: "start_message", label: "start message", type: "string"/);
  assert.match(workbench, /inputFor\("system_prompt", node\.config\.systemPrompt/);
  assert.match(workbench, /connectedConfiguredValue\(workflow, start\.id, "start_message"\)/);
  assert.match(workbench, /node\.type === "save"[^\n]+\.\.\.mediaInputs[^\n]+\.\.\.mediaOutputs/);
  assert.match(workbench, /node\.type === "load"[^\n]+\.\.\.mediaOutputs/);
  assert.match(workbench, /output\("image", mediaAssets\(loaded\.files, "image"\)\)/);
  assert.match(workbench, /output\("video", mediaAssets\(loaded\.files, "video"\)\)/);
  assert.match(workbench, /assets: !localResult && node\.config\.saveFiles !== "data" \? files : undefined/);
  assert.match(workbench, /fileAssetsPromptSections\(fileInput\)/);
  assert.match(workbench, /collectFileAssets\(suppliedFiles, suppliedMedia, documentInput\)/);
  assert.match(workbench, /files: fileInput/);
});

test("stores large workflow and plug-in artifacts outside localStorage", async () => {
  const workbench = await readFile(new URL("../app/workbench.tsx", import.meta.url), "utf8");
  assert.match(workbench, /readStoredArtifact<Workflow\[]>\("workflows"\)/);
  assert.match(workbench, /writeStoredArtifact\("workflows", workflows\)/);
  assert.match(workbench, /writeStoredArtifact\("plugins", plugins\)/);
  assert.match(workbench, /artifactFallbackJson\(workflows\)/);
  assert.doesNotMatch(workbench, /localStorage\.setItem\("magic-conch-workflows", JSON\.stringify\(workflows\)\)/);
});

test("lets users limit parallel workflow execution", async () => {
  const workbench = await readFile(new URL("../app/workbench.tsx", import.meta.url), "utf8");
  assert.match(workbench, /magic-conch-workflow-parallelism/);
  assert.match(workbench, />Maximum parallel nodes</);
  assert.match(workbench, />Set limit automatically</);
  assert.match(workbench, /magic-conch-workflow-parallelism-auto/);
  assert.match(workbench, /createWorkflowTaskLimiter\(\(\) => workflowParallelismRef\.current\)/);
  assert.match(workbench, /mapWithConcurrencyLimit\(activeReady, \(\) => workflowParallelismRef\.current/);
  assert.match(workbench, /mapWithConcurrencyLimit\(executable, \(\) => workflowParallelismRef\.current/);
});

test("uses direct links for fan-out instead of offering a Parallel node", async () => {
  const workbench = await readFile(new URL("../app/workbench.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(workbench, /parallel: \{ label: "Parallel"/);
  assert.doesNotMatch(workbench, /types: \[[^\]]*"parallel"/);
  assert.match(workbench, /bypassLegacyParallelNodes\(workflow\)/);
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
