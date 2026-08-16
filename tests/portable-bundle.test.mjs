import assert from "node:assert/strict";
import test from "node:test";
import { strToU8, unzipSync, zipSync } from "fflate";
import { createPortableBundle, createPortableBundles, readPortableBundle, readPortableBundleParts } from "../lib/portable-bundle.ts";

test("round-trips a manifest and its own files through a zip", () => {
  const manifest = {
    id: "workflow-1",
    name: "Portable flow",
    nodes: [],
    edges: [],
    files: [
      { name: "notes/안내.txt", type: "text/plain", size: 5, data: "data:text/plain;base64,aGVsbG8=" },
      { name: "pixel.bin", type: "application/octet-stream", size: 3, data: "data:application/octet-stream;base64,AAEC" },
    ],
  };

  const restored = readPortableBundle(createPortableBundle(manifest, "workflow.json"), "workflow.json");
  assert.equal(restored.name, "Portable flow");
  assert.deepEqual(restored.files, manifest.files);
});

test("loads hand-authored bundles and discovers unlisted files", () => {
  const archive = zipSync({
    "my-plugin/plugin.json": strToU8(JSON.stringify({ id: "demo", name: "Demo", version: "1", nodes: [] })),
    "my-plugin/files/scripts/run.js": strToU8("return input;"),
    "my-plugin/files/icon.svg": strToU8("<svg></svg>"),
  });

  const restored = readPortableBundle(archive, "plugin.json");
  assert.deepEqual(restored.files?.map((file) => file.name), ["scripts/run.js", "icon.svg"]);
  assert.equal(restored.files?.[0].type, "text/javascript");
  assert.match(restored.files?.[0].data || "", /^data:text\/javascript;base64,/);
});

test("rejects zip traversal paths", () => {
  const archive = zipSync({
    "workflow.json": strToU8(JSON.stringify({ name: "Unsafe", files: [{ name: "bad", path: "../bad.txt" }] })),
    "bad.txt": strToU8("bad"),
  });
  assert.throws(() => readPortableBundle(archive, "workflow.json"), /unsafe file path/i);
});

test("stores and restores every manifest with its own files", () => {
  const data = "data:text/plain;base64,b25l";
  const archive = createPortableBundles([
    { manifestPath: "workflow.json", manifest: { id: "root", files: [{ name: "root.txt", type: "text/plain", size: 3, data }] } },
    { manifestPath: "dependencies/workflows/child/workflow.json", manifest: { id: "child", files: [{ name: "child.txt", type: "text/plain", size: 3, data }] } },
    { manifestPath: "dependencies/plugins/demo/plugin.json", manifest: { id: "demo", files: [{ name: "script.js", type: "text/javascript", size: 3, data }] } },
  ]);

  const workflows = readPortableBundleParts(archive, "workflow.json");
  const plugins = readPortableBundleParts(archive, "plugin.json");
  assert.deepEqual(workflows.map((part) => part.manifest.id), ["root", "child"]);
  assert.deepEqual(workflows.map((part) => part.manifest.files?.[0].name), ["root.txt", "child.txt"]);
  assert.equal(plugins[0].manifest.files?.[0].name, "script.js");
});

test("preserves file metadata used to bind runtime Load snapshots", () => {
  const archive = createPortableBundle({
    id: "workflow",
    files: [{
      name: "loaded.txt",
      type: "text/plain",
      size: 4,
      data: "data:text/plain;base64,bG9hZA==",
      bundleLoadNodeId: "load-1",
    }],
  }, "workflow.json");
  const restored = readPortableBundle(archive, "workflow.json");
  assert.equal(restored.files?.[0].bundleLoadNodeId, "load-1");
});

test("stores files from separate Load directories in separate archive directories", () => {
  const data = "data:text/plain;base64,c2FtZQ==";
  const archive = createPortableBundle({
    id: "workflow",
    files: [
      { name: "nested/shared.txt", type: "text/plain", size: 4, data, bundleLoadNodeId: "load-1" },
      { name: "nested/shared.txt", type: "text/plain", size: 4, data, bundleLoadNodeId: "load-2" },
    ],
  }, "workflow.json");

  const paths = Object.keys(unzipSync(archive)).filter((path) => path.endsWith("shared.txt"));
  assert.deepEqual(paths, [
    "files/load-nodes/1-load-1/nested/shared.txt",
    "files/load-nodes/2-load-2/nested/shared.txt",
  ]);

  const restored = readPortableBundle(archive, "workflow.json");
  assert.deepEqual(restored.files?.map((file) => [file.bundleLoadNodeId, file.name]), [
    ["load-1", "nested/shared.txt"],
    ["load-2", "nested/shared.txt"],
  ]);
});
