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

test("uses Start node settings for the chat agent and opening message", async () => {
  const workbench = await readFile(new URL("../app/workbench.tsx", import.meta.url), "utf8");

  assert.match(workbench, /agentName\?: string/);
  assert.match(workbench, /startMessage\?: string/);
  assert.match(workbench, /function getStartSettings/);
  assert.match(workbench, />Agent name<input/);
  assert.match(workbench, />Start message<textarea/);
  assert.match(workbench, /meta: getStartSettings\(activeWorkflow\)\.agentName/);
});
