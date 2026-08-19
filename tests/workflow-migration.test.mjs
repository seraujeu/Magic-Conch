import assert from "node:assert/strict";
import test from "node:test";

import { bypassLegacyParallelNodes } from "../lib/workflow-migration.ts";

test("replaces a legacy Parallel node with direct fan-out links", () => {
  const workflow = {
    nodes: [
      { id: "source", type: "request" },
      { id: "fan-out", type: "parallel" },
      { id: "branch-a", type: "request" },
      { id: "branch-b", type: "request" },
    ],
    edges: [
      { id: "into", from: "source", fromPort: "prompt", to: "fan-out", toPort: "value", dataType: "prompt" },
      { id: "to-a", from: "fan-out", fromPort: "value", to: "branch-a", toPort: "prompt", dataType: "any" },
      { id: "to-b", from: "fan-out", fromPort: "value", to: "branch-b", toPort: "prompt", dataType: "any" },
    ],
  };

  const migrated = bypassLegacyParallelNodes(workflow);

  assert.deepEqual(migrated.nodes.map((node) => node.id), ["source", "branch-a", "branch-b"]);
  assert.deepEqual(migrated.edges, [
    { id: "to-a", from: "source", fromPort: "prompt", to: "branch-a", toPort: "prompt", dataType: "prompt" },
    { id: "to-b", from: "source", fromPort: "prompt", to: "branch-b", toPort: "prompt", dataType: "prompt" },
  ]);
});

test("removes an inactive legacy Parallel node that has no input", () => {
  const workflow = {
    nodes: [
      { id: "fan-out", type: "parallel" },
      { id: "branch", type: "request" },
    ],
    edges: [
      { id: "out", from: "fan-out", fromPort: "value", to: "branch", toPort: "prompt", dataType: "any" },
    ],
  };

  assert.deepEqual(bypassLegacyParallelNodes(workflow), {
    nodes: [{ id: "branch", type: "request" }],
    edges: [],
  });
});
