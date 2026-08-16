import assert from "node:assert/strict";
import test from "node:test";
import { executePluginNode, validatePlugin } from "../lib/plugin-system.ts";

const sourceFile = {
  name: "scripts/run.js",
  type: "text/javascript",
  size: 52,
  data: "data:text/javascript;base64,cmV0dXJuIGZpbGVzLm1hcChmaWxlID0+IGZpbGUubmFtZSkuam9pbignLCcpICsgJzonICsgaW5wdXQ7",
};

test("runs JavaScript from a bundled plug-in file and exposes bundled files", async () => {
  const plugin = validatePlugin({
    id: "bundle",
    name: "Bundle",
    version: "1",
    files: [sourceFile],
    nodes: [{
      type: "bundle:run",
      label: "Run",
      executor: { kind: "javascript", file: "scripts/run.js" },
    }],
  });

  const result = await executePluginNode(plugin.nodes[0], { prompt: "hello" }, {}, {}, plugin.files);
  assert.equal(result, "scripts/run.js:hello");
});

test("requires inline executor content or a bundled source reference", () => {
  assert.throws(() => validatePlugin({
    id: "bad",
    name: "Bad",
    version: "1",
    nodes: [{ type: "bad:run", label: "Run", executor: { kind: "javascript" } }],
  }), /needs JavaScript code/i);
});

test("rejects a missing bundled executor source during installation", () => {
  assert.throws(() => validatePlugin({
    id: "bad",
    name: "Bad",
    version: "1",
    nodes: [{ type: "bad:run", label: "Run", executor: { kind: "javascript", file: "missing.js" } }],
  }), /plug-in file.*missing\.js.*missing/i);
});
