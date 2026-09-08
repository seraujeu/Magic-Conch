import assert from "node:assert/strict";
import test from "node:test";
import { createWorkflowPreset, instantiateWorkflowPreset, parseWorkflowPresets } from "../lib/workflow-presets.ts";

const nodes = [
  { id: "a", type: "request", name: "Draft", x: 220, y: 140, config: { prompt: "Write" } },
  { id: "b", type: "parser", name: "Parse", x: 500, y: 190, config: {} },
];
const edges = [
  { id: "internal", from: "a", fromPort: "prompt", to: "b", toPort: "prompt", dataType: "prompt" },
  { id: "external", from: "outside", to: "a" },
];

test("creates a position-normalized preset with only internal edges", () => {
  const preset = createWorkflowPreset("  Draft and parse  ", nodes, edges, "preset-1", "2026-09-04T00:00:00.000Z");
  assert.equal(preset.name, "Draft and parse");
  assert.deepEqual(preset.nodes.map(({ id, x, y }) => ({ id, x, y })), [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 280, y: 50 },
  ]);
  assert.deepEqual(preset.edges.map((edge) => edge.id), ["internal"]);
});

test("instantiates fresh node and edge IDs at the requested origin", () => {
  const preset = createWorkflowPreset("Draft and parse", nodes, edges, "preset-1");
  let nextNode = 0;
  const instance = instantiateWorkflowPreset(preset, { x: 100, y: 80 }, () => `node-${++nextNode}`, () => "edge-1");
  assert.deepEqual(instance.nodes.map(({ id, x, y }) => ({ id, x, y })), [
    { id: "node-1", x: 100, y: 80 },
    { id: "node-2", x: 380, y: 130 },
  ]);
  assert.deepEqual(instance.edges.map(({ id, from, to }) => ({ id, from, to })), [
    { id: "edge-1", from: "node-1", to: "node-2" },
  ]);
});

test("parses valid stored presets and ignores malformed entries", () => {
  const preset = createWorkflowPreset("Draft", nodes.slice(0, 1), [], "preset-1");
  assert.deepEqual(parseWorkflowPresets([preset, { id: "broken", nodes: [] }, null]), [preset]);
  assert.deepEqual(parseWorkflowPresets({ presets: [preset] }), []);
});
