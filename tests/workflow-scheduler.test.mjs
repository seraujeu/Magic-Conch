import assert from "node:assert/strict";
import test from "node:test";

import {
  createWorkflowTaskLimiter,
  DEFAULT_WORKFLOW_PARALLELISM,
  isWorkflowNodeActive,
  mapWithConcurrencyLimit,
  normalizeWorkflowParallelism,
} from "../lib/workflow-scheduler.ts";

const edge = (from, fromPort, toPort) => ({ from, fromPort, toPort });

test("runs configured Load nodes as pull sources when their outputs are needed", () => {
  assert.equal(isWorkflowNodeActive({
    nodeType: "load",
    inputPorts: [{ id: "trigger" }, { id: "key" }, { id: "subfolder" }],
    incoming: [],
    emittedPortKeys: new Set(),
  }), true);

  assert.equal(isWorkflowNodeActive({
    nodeType: "list-directory",
    inputPorts: [{ id: "trigger" }, { id: "subfolder" }, { id: "recursive" }],
    incoming: [],
    emittedPortKeys: new Set(),
  }), true);
});

test("runs configured memory updates as pull sources", () => {
  assert.equal(isWorkflowNodeActive({
    nodeType: "update-memory",
    inputPorts: [{ id: "content" }, { id: "memory_id" }],
    incoming: [],
    emittedPortKeys: new Set(),
  }), true);
});

test("keeps connected trigger inputs as activation gates", () => {
  const incoming = [edge("router", "selected", "trigger")];

  assert.equal(isWorkflowNodeActive({
    nodeType: "load",
    inputPorts: [{ id: "trigger" }, { id: "key" }],
    incoming,
    emittedPortKeys: new Set(),
  }), false);

  assert.equal(isWorkflowNodeActive({
    nodeType: "load",
    inputPorts: [{ id: "trigger" }, { id: "key" }],
    incoming,
    emittedPortKeys: new Set(["router:selected"]),
  }), true);
});

test("activates the Load, Join, Request, End chain from the reported workflow", () => {
  const emitted = new Set([
    "start:prompt", "start:files", "start:image", "start:video",
    "start:audio", "start:document", "string:value",
  ]);

  assert.equal(isWorkflowNodeActive({
    nodeType: "load",
    inputPorts: [{ id: "trigger" }, { id: "key" }, { id: "subfolder" }],
    incoming: [],
    emittedPortKeys: emitted,
  }), true);

  emitted.add("load:files");
  emitted.add("load:document");
  assert.equal(isWorkflowNodeActive({
    nodeType: "join",
    inputPorts: [{ id: "input1" }, { id: "input2" }, { id: "input3" }, { id: "input4" }],
    incoming: [
      edge("start", "files", "input1"),
      edge("load", "files", "input2"),
      edge("load", "document", "input3"),
    ],
    emittedPortKeys: emitted,
  }), true);

  emitted.add("join:result");
  assert.equal(isWorkflowNodeActive({
    nodeType: "request",
    inputPorts: [
      { id: "prompt" }, { id: "system_prompt" }, { id: "files" },
      { id: "image" }, { id: "video" }, { id: "audio" }, { id: "document" },
    ],
    incoming: [
      edge("start", "prompt", "prompt"),
      edge("string", "value", "system_prompt"),
      edge("join", "result", "files"),
      edge("start", "image", "image"),
      edge("start", "video", "video"),
      edge("start", "audio", "audio"),
      edge("start", "document", "document"),
    ],
    emittedPortKeys: emitted,
  }), true);

  for (const port of ["prompt", "files", "image", "video", "audio", "document"]) {
    emitted.add(`request:${port}`);
  }
  assert.equal(isWorkflowNodeActive({
    nodeType: "end",
    inputPorts: [
      { id: "prompt" }, { id: "files" }, { id: "image" },
      { id: "video" }, { id: "audio" }, { id: "document" },
    ],
    incoming: [
      edge("request", "prompt", "prompt"),
      edge("request", "files", "files"),
      edge("request", "image", "image"),
      edge("request", "video", "video"),
      edge("request", "audio", "audio"),
      edge("request", "document", "document"),
    ],
    emittedPortKeys: emitted,
  }), true);
});

test("does not auto-run arbitrary disconnected processing nodes", () => {
  assert.equal(isWorkflowNodeActive({
    nodeType: "transform",
    inputPorts: [{ id: "value" }],
    incoming: [],
    emittedPortKeys: new Set(),
  }), false);
});

test("activates Join when some connected inputs are empty", () => {
  const incoming = [
    edge("assigner", "output-1", "input1"),
    edge("assigner", "output-2", "input2"),
    edge("assigner", "output-3", "input3"),
  ];

  assert.equal(isWorkflowNodeActive({
    nodeType: "join",
    inputPorts: [{ id: "input1" }, { id: "input2" }, { id: "input3" }],
    incoming,
    emittedPortKeys: new Set(["assigner:output-2"]),
  }), true);
});

test("activates Join with an empty result when no connected input emitted", () => {
  assert.equal(isWorkflowNodeActive({
    nodeType: "join",
    inputPorts: [{ id: "input1" }, { id: "input2" }],
    incoming: [
      edge("router", "route-1", "input1"),
      edge("router", "route-2", "input2"),
    ],
    emittedPortKeys: new Set(),
  }), true);
});

test("normalizes the saved workflow parallelism setting", () => {
  assert.equal(normalizeWorkflowParallelism(undefined), DEFAULT_WORKFLOW_PARALLELISM);
  assert.equal(normalizeWorkflowParallelism("8"), 8);
  assert.equal(normalizeWorkflowParallelism(0), 1);
  assert.equal(normalizeWorkflowParallelism(500), 32);
});

test("maps ready nodes without exceeding the selected parallelism", async () => {
  let active = 0;
  let peak = 0;
  const results = await mapWithConcurrencyLimit([1, 2, 3, 4, 5, 6], 2, async (value) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return value * 10;
  });

  assert.equal(peak, 2);
  assert.deepEqual(results, [10, 20, 30, 40, 50, 60]);
});

test("shares one execution budget across nested workflow schedulers", async () => {
  const limiter = createWorkflowTaskLimiter(3);
  let active = 0;
  let peak = 0;
  const runTask = () => limiter.run(async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
  });

  await Promise.all([
    mapWithConcurrencyLimit([1, 2, 3, 4], 4, runTask),
    mapWithConcurrencyLimit([5, 6, 7, 8], 4, runTask),
  ]);

  assert.equal(peak, 3);
});
