import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateJoinValues,
  createJoinInput,
  defaultJoinTemplate,
  growJoinInputs,
  joinInputVariable,
} from "../lib/join-aggregate.ts";

const inputs = [
  { ...createJoinInput(1), variable: "intro", value: "Hello" },
  { ...createJoinInput(2), variable: "person", value: { name: "Ada", score: 4 } },
];

test("aggregates growing join inputs in their displayed order", () => {
  assert.deepEqual(aggregateJoinValues("array", inputs), ["Hello", { name: "Ada", score: 4 }]);
  assert.deepEqual(aggregateJoinValues("object", inputs), {
    intro: "Hello",
    person: { name: "Ada", score: 4 },
  });
  assert.equal(aggregateJoinValues("concat", inputs), 'Hello{\n  "name": "Ada",\n  "score": 4\n}');
  assert.equal(aggregateJoinValues("sum", [
    { ...createJoinInput(1), value: 2 },
    { ...createJoinInput(2), value: "3" },
  ]), 5);
});

test("places join inputs with prompt variables and supports nested values", () => {
  assert.equal(
    aggregateJoinValues("template", inputs, "{{person.name}} says: {{intro}}. {{unknown}}"),
    "Ada says: Hello. {{unknown}}",
  );
  assert.equal(
    aggregateJoinValues("template", [...inputs, { ...createJoinInput(3), variable: "optional", value: undefined }], "{{intro}}{{optional}}"),
    "Hello",
  );
  assert.equal(defaultJoinTemplate(inputs), "{{intro}}\n\n{{person}}");
});

test("adds a fresh join input only when the final available port is linked", () => {
  const ports = [createJoinInput(1), createJoinInput(2)];
  assert.strictEqual(growJoinInputs(ports, ports[0].id), ports);
  assert.deepEqual(growJoinInputs(ports, ports[1].id, "next-port"), [
    ...ports,
    { id: "next-port", variable: "input3" },
  ]);
});

test("falls back to a generated variable for legacy join inputs", () => {
  assert.equal(joinInputVariable({ id: "legacy-port" }, 0), "input1");
  assert.equal(defaultJoinTemplate([{ id: "legacy-port" }]), "{{input1}}");
  assert.deepEqual(
    aggregateJoinValues("object", [{ id: "legacy-port", value: "Hello" }]),
    { input1: "Hello" },
  );
});
