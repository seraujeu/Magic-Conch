import test from "node:test";
import assert from "node:assert/strict";
import {
  createMathInput,
  evaluateMathExpression,
  growMathInputs,
} from "../lib/math-expression.ts";

test("evaluates named math inputs with variable syntax", () => {
  const inputs = [
    { ...createMathInput(1), variable: "price", value: "12.5" },
    { ...createMathInput(2), variable: "quantity", value: 4 },
  ];
  assert.equal(evaluateMathExpression("{{price}} * {{quantity}}", inputs, "float"), 50);
  assert.equal(evaluateMathExpression("round(price / 3)", inputs, "integer"), 4);
  assert.equal(evaluateMathExpression("max(price, quantity) + 0.5", inputs, "string"), "13");
});

test("supports precedence, unary values, powers, and constants", () => {
  assert.equal(evaluateMathExpression("-2^2 + (3 * 4)", [], "float"), 8);
  assert.equal(evaluateMathExpression("sqrt(16) + 2 ** 3", [], "float"), 12);
  assert.equal(evaluateMathExpression("round(PI)", [], "integer"), 3);
});

test("grows math inputs only when the final port is connected", () => {
  const inputs = [createMathInput(1), createMathInput(2)];
  assert.strictEqual(growMathInputs(inputs, inputs[0].id), inputs);
  assert.deepEqual(growMathInputs(inputs, inputs[1].id, "next"), [
    ...inputs,
    { id: "next", variable: "input3" },
  ]);
});

test("rejects missing or nonnumeric variables", () => {
  assert.throws(() => evaluateMathExpression("missing + 1", [], "float"), /no connected value/);
  assert.throws(() => evaluateMathExpression("value + 1", [{ id: "one", variable: "value", value: "nope" }], "float"), /must be a number/);
});
