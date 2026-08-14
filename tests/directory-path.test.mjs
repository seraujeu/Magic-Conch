import assert from "node:assert/strict";
import test from "node:test";

import { directorySubfolderSegments } from "../lib/directory-path.ts";

test("resolves relative subfolders beneath the selected directory", () => {
  assert.deepEqual(directorySubfolderSegments("reports/2026"), ["reports", "2026"]);
  assert.deepEqual(directorySubfolderSegments("."), []);
});

test("reduces a Windows absolute path to the portion beneath the granted directory", () => {
  assert.deepEqual(
    directorySubfolderSegments("C:\\Office\\files\\부동산 매니저", "부동산 매니저"),
    [],
  );
  assert.deepEqual(
    directorySubfolderSegments("C:\\Office\\files\\부동산 매니저\\incoming", "부동산 매니저"),
    ["incoming"],
  );
});

test("rejects absolute paths outside the granted directory", () => {
  assert.throws(
    () => directorySubfolderSegments("C:\\Office\\files\\other", "부동산 매니저"),
    /cannot open an absolute path directly/,
  );
});
