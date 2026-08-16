import assert from "node:assert/strict";
import test from "node:test";
import { applyBundledLoadSnapshots, bundledLoadResult, materializedLoadDirectory, workflowInputFiles } from "../lib/workflow-load-bundle.ts";

const regular = { name: "prompt.txt", type: "text/plain", size: 6, data: "data:text/plain;base64,cHJvbXB0" };
const loaded = { name: "input.txt", type: "text/plain", size: 5, data: "data:text/plain;base64,aW5wdXQ=" };

test("keeps runtime Load files separate from ordinary workflow inputs", () => {
  const workflow = applyBundledLoadSnapshots({ files: [regular] }, {
    "load-1": { value: "loaded value", files: [loaded] },
  });

  assert.deepEqual(workflowInputFiles(workflow), [regular]);
  assert.equal(workflow.files?.[1].bundleLoadNodeId, "load-1");
  assert.deepEqual(bundledLoadResult(workflow, "load-1"), {
    value: "loaded value",
    files: [loaded],
  });
  assert.equal(bundledLoadResult(workflow, "missing"), null);
});

test("replacing snapshots removes stale packaged Load files", () => {
  const first = applyBundledLoadSnapshots({ files: [regular] }, {
    "load-1": { value: "old", files: [loaded] },
  });
  const replaced = applyBundledLoadSnapshots(first, {
    "load-2": { value: "new", files: [{ ...loaded, name: "new.txt" }] },
  });

  assert.equal(bundledLoadResult(replaced, "load-1"), null);
  assert.equal(bundledLoadResult(replaced, "load-2")?.files[0].name, "new.txt");
  assert.deepEqual(workflowInputFiles(replaced), [regular]);
});

test("creates corresponding user-data locations for imported Load nodes", () => {
  assert.equal(
    materializedLoadDirectory(
      { id: "workflow:1", name: "부동산매니저 / GPT" },
      { id: "load:1", name: "Load 자료" },
    ),
    "user-data/workflow-files/부동산매니저-GPT-workflow-1/Load-자료-load-1",
  );
});

test("keeps files from different Load directories in different materialized directories", () => {
  const workflow = { id: "workflow-1", name: "Folder workflow" };
  const first = materializedLoadDirectory(workflow, { id: "load-1", name: "All source files" });
  const second = materializedLoadDirectory(workflow, { id: "load-2", name: "All source files" });

  assert.notEqual(first, second);
  assert.match(first, /\/All-source-files-load-1$/);
  assert.match(second, /\/All-source-files-load-2$/);
});
