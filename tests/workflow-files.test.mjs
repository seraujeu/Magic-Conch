import assert from "node:assert/strict";
import test from "node:test";

import { workflowExportFilename, workflowFileText } from "../lib/workflow-files.ts";

test("keeps non-English letters in workflow export filenames", () => {
  assert.equal(workflowExportFilename("研究 흐름"), "研究-흐름.json");
  assert.equal(workflowExportFilename("Überblick français"), "überblick-français.json");
  assert.equal(workflowExportFilename("  🐚  "), "workflow.json");
});

test("accepts UTF-8 workflow JSON with an optional byte-order mark", () => {
  const json = '{"name":"한국어 워크플로"}';
  assert.deepEqual(JSON.parse(workflowFileText(`\uFEFF${json}`)), { name: "한국어 워크플로" });
  assert.equal(workflowFileText(json), json);
});
