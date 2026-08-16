import assert from "node:assert/strict";
import test from "node:test";
import { artifactFallbackJson } from "../lib/artifact-storage.ts";

test("workflow fallback preserves structure without embedded file bodies", () => {
  const json = artifactFallbackJson([{
    id: "workflow-1",
    name: "Portable",
    nodes: [{ id: "load-1", type: "load" }],
    files: [{ name: "large.bin", size: 5_000_000, data: "data:application/octet-stream;base64,AAAA" }],
  }]);
  const restored = JSON.parse(json);
  assert.equal(restored[0].name, "Portable");
  assert.equal(restored[0].nodes[0].type, "load");
  assert.equal(restored[0].files[0].data, "");
  assert.doesNotMatch(json, /base64/);
});

test("plug-in fallback also strips bundled asset data", () => {
  const json = artifactFallbackJson([{
    id: "demo",
    nodes: [],
    files: [{ name: "script.js", data: "data:text/javascript;base64,AAAA" }],
  }]);
  assert.equal(JSON.parse(json)[0].files[0].data, "");
});
