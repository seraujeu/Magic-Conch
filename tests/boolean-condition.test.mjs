import assert from "node:assert/strict";
import test from "node:test";

import { evaluateBooleanRule, parseAIBoolean } from "../lib/boolean-condition.ts";

test("evaluates text, numeric, and file rules as booleans", () => {
  assert.equal(evaluateBooleanRule("Ship URGENT", [], { method: "contains", expected: "urgent" }), true);
  assert.equal(evaluateBooleanRule("Ship URGENT", [], { method: "contains", expected: "urgent", caseSensitive: true }), false);
  assert.equal(evaluateBooleanRule(12, [], { method: "number_gt", expected: "10" }), true);
  assert.equal(evaluateBooleanRule("anything", [{ name: "brief.PDF", type: "application/pdf" }], { method: "file_type", expected: "pdf" }), true);
  assert.equal(evaluateBooleanRule("[", [], { method: "regex", expected: "[" }), false);
});

test("parses strict and structured AI boolean decisions", () => {
  assert.equal(parseAIBoolean("true"), true);
  assert.equal(parseAIBoolean("FALSE."), false);
  assert.equal(parseAIBoolean('{"result":true}'), true);
  assert.equal(parseAIBoolean("Result: false"), false);
  assert.throws(() => parseAIBoolean("true or false"), /unambiguous/);
  assert.throws(() => parseAIBoolean("maybe"), /unambiguous/);
});
