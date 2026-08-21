import assert from "node:assert/strict";
import test from "node:test";

import { collectDebugFiles, sanitizeDebugData, sanitizeDebugValue } from "../lib/debug-data.ts";

test("removes embedded attachment bytes from live debug data", () => {
  const file = {
    name: "large.pdf",
    type: "application/pdf",
    size: 36_000_000,
    data: "data:application/pdf;base64,very-large-payload",
  };
  const sanitized = sanitizeDebugData([{ port: "files", value: [[file], file] }]);

  assert.equal(JSON.stringify(sanitized).includes("very-large-payload"), false);
  assert.deepEqual(collectDebugFiles(sanitized[0].value), [{
    name: "large.pdf",
    type: "application/pdf",
    size: 36_000_000,
    contentOmitted: true,
  }]);
});

test("bounds long strings and collection previews", () => {
  const value = sanitizeDebugValue({
    prompt: "x".repeat(25_000),
    rows: Array.from({ length: 120 }, (_, index) => index),
  });

  assert.match(value.prompt, /Debug preview truncated/);
  assert.equal(value.rows.length, 101);
  assert.match(value.rows.at(-1), /20 additional items omitted/);
});

test("handles circular debug values without throwing", () => {
  const value = {};
  value.self = value;

  assert.deepEqual(sanitizeDebugValue(value), { self: "[Circular or repeated reference]" });
});
