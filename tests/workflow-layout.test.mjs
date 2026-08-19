import assert from "node:assert/strict";
import test from "node:test";

import { organizeWorkflowNodes } from "../lib/workflow-layout.ts";

test("organizes workflow nodes by dependency order without overlap", () => {
  const nodes = [
    { id: "start", x: 50, y: 40, height: 110 },
    { id: "left", x: 70, y: 45, height: 180 },
    { id: "right", x: 80, y: 50, height: 90 },
    { id: "end", x: 90, y: 55, height: 120 },
  ];
  const edges = [
    { from: "start", to: "left" },
    { from: "start", to: "right" },
    { from: "left", to: "end" },
    { from: "right", to: "end" },
  ];

  const result = organizeWorkflowNodes(nodes, edges, { nodeHeight: (node) => node.height });
  const byId = Object.fromEntries(result.map((node) => [node.id, node]));

  assert.ok(byId.start.x < byId.left.x);
  assert.equal(byId.left.x, byId.right.x);
  assert.ok(byId.left.y + byId.left.height < byId.right.y);
  assert.ok(byId.left.x < byId.end.x);
  assert.deepEqual(nodes.map(({ x, y }) => ({ x, y })), [
    { x: 50, y: 40 }, { x: 70, y: 45 }, { x: 80, y: 50 }, { x: 90, y: 55 },
  ]);
});

test("keeps disconnected and cyclic nodes deterministic and separated", () => {
  const nodes = [
    { id: "a", x: 10, y: 20 },
    { id: "b", x: 10, y: 20 },
    { id: "loose", x: 10, y: 20 },
  ];
  const result = organizeWorkflowNodes(nodes, [
    { from: "a", to: "b" },
    { from: "b", to: "a" },
  ], { nodeHeight: () => 100, verticalGap: 20 });

  assert.deepEqual(result.map(({ x, y }) => ({ x, y })), [
    { x: 10, y: 20 },
    { x: 10, y: 140 },
    { x: 10, y: 260 },
  ]);
});
