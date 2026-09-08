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

test("file type matching respects case sensitivity for extensions and MIME types", () => {
  for (const [files, expected, sensitiveMatch] of [
    [[{ name: "report.PDF", type: "application/octet-stream" }], "PDF", true],
    [[{ name: "report.PDF", type: "application/octet-stream" }], ".PDF", true],
    [[{ name: "report.pdf", type: "application/octet-stream" }], "PDF", false],
    [[{ name: "report.PDF", type: "application/octet-stream" }], ".pdf", false],
    [[{ name: "report", type: "application/PDF" }], "application/PDF", true],
    [[{ name: "report", type: "application/pdf" }], "application/PDF", false],
  ]) {
    assert.equal(evaluateBooleanRule("", files, { method: "file_type", expected, caseSensitive: true }), sensitiveMatch);
    assert.equal(evaluateBooleanRule("", files, { method: "file_type", expected, caseSensitive: false }), true);
  }
});
