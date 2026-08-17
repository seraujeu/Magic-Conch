import assert from "node:assert/strict";
import test from "node:test";

import { readFile } from "node:fs/promises";

import { createDebugLog, debugLogFilename } from "../lib/debug-log.ts";

test("creates portable debug log filenames for chat titles", () => {
  const exportedAt = new Date("2026-08-16T12:34:56.789Z");
  assert.equal(
    debugLogFilename("연구 Chat 🐚", exportedAt),
    "연구-chat-debug-log-2026-08-16T12-34-56Z.json",
  );
  assert.equal(debugLogFilename("🐚", exportedAt), "chat-debug-log-2026-08-16T12-34-56Z.json");
});

test("exports chat and run context without embedding attachment bytes", () => {
  const file = {
    name: "input.png",
    type: "image/png",
    size: 2048,
    data: "data:image/png;base64,very-large-payload",
  };
  const log = createDebugLog({
    exportedAt: "2026-08-16T12:34:56.789Z",
    chat: { id: "chat-1", messages: [{ role: "user", text: "Inspect this", files: [file] }] },
    workflow: { id: "workflow-1", name: "Inspector" },
    run: { status: "idle", events: [{ fileSource: "C:\\work\\inputs", inputs: [{ type: "files", value: [file] }] }] },
  });

  assert.equal(log.format, "magic-conch-debug-log");
  assert.equal(log.version, 1);
  assert.equal(log.exportedAt, "2026-08-16T12:34:56.789Z");
  assert.deepEqual(log.chat.messages[0].files[0], {
    name: "input.png",
    type: "image/png",
    size: 2048,
    contentOmitted: true,
  });
  assert.equal(JSON.stringify(log).includes("very-large-payload"), false);
  assert.equal(log.run.events[0].fileSource, "C:\\work\\inputs");
});

test("exposes debug-log export from the chat debugger", async () => {
  const workbench = await readFile(new URL("../app/workbench.tsx", import.meta.url), "utf8");

  assert.match(workbench, /aria-label="Export debug log"/);
  assert.match(workbench, /onClick=\{exportDebugLog\}/);
  assert.match(workbench, /disabled=\{!debugEvents\.length\}/);
  assert.match(workbench, /Files loaded from/);
  assert.match(workbench, /fileSource: debugFileSource/);
});
