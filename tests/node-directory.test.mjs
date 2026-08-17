import assert from "node:assert/strict";
import test from "node:test";
import { configuredNodeDirectory, displayNodeDirectory, migrateLegacyNodeDirectory, resolveNodeDirectory } from "../lib/node-directory.ts";

test("uses persistent node paths without a browser folder handle", () => {
  assert.equal(configuredNodeDirectory({ directoryPath: "D:\\work\\records" }, "user-data"), "D:\\work\\records");
  assert.equal(configuredNodeDirectory({ directoryPath: "  records  " }, "user-data"), "records");
});

test("migrates old browser folder names to relative persistent paths", () => {
  assert.equal(configuredNodeDirectory({ directoryName: "부동산 매니저" }, "user-data"), "부동산 매니저");
  assert.equal(configuredNodeDirectory({}, "user-data"), "user-data");
});

test("treats a legacy absolute subfolder as the persistent directory", () => {
  assert.deepEqual(
    resolveNodeDirectory({ directoryName: "old-handle", subfolder: "C:\\자료\\부동산 매니저" }, "user-data"),
    { directory: "C:\\자료\\부동산 매니저", subfolder: [] },
  );
  assert.deepEqual(
    migrateLegacyNodeDirectory({ directoryName: "old-handle", subfolder: "C:\\자료\\부동산 매니저" }),
    { directoryName: undefined, directoryPath: "C:\\자료\\부동산 매니저", subfolder: "" },
  );
});

test("keeps relative subfolders beneath the persistent directory", () => {
  assert.deepEqual(
    resolveNodeDirectory({ directoryPath: "D:\\records", subfolder: "reports/2026" }, "user-data"),
    { directory: "D:\\records", subfolder: ["reports", "2026"] },
  );
  assert.throws(
    () => resolveNodeDirectory({ directoryPath: "D:\\records", subfolder: "../outside" }, "user-data"),
    /unsupported segment/,
  );
});

test("shows the full resolved source path in the debugger", () => {
  assert.equal(displayNodeDirectory("D:\\records", ["reports", "2026"]), "D:\\records\\reports\\2026");
  assert.equal(displayNodeDirectory("user-data", ["reports", "2026"]), "user-data/reports/2026");
  assert.equal(displayNodeDirectory("/srv/data/", ["reports"]), "/srv/data/reports");
});
