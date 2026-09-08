import assert from "node:assert/strict";
import test from "node:test";

import {
  driveRecordFilename,
  isDriveRecordMatch,
  normalizeDriveExtension,
  safeDriveFilename,
  splitDriveFolderPath,
} from "../lib/google-drive.ts";

test("normalizes Google Drive record names like local Save nodes", () => {
  assert.equal(safeDriveFilename("Quarterly report / final"), "Quarterly-report---final");
  assert.equal(normalizeDriveExtension("..JSON"), "json");
  assert.equal(driveRecordFilename("Quarterly report", ".json"), "Quarterly-report.json");
});

test("matches exact and versioned Google Drive records", () => {
  assert.equal(isDriveRecordMatch("result.json", "result.json", true), true);
  assert.equal(isDriveRecordMatch("result-2.json", "result.json", true), false);
  assert.equal(isDriveRecordMatch("result-2.json", "result.json", false), true);
  assert.equal(isDriveRecordMatch("result-2.txt", "result.json", false), false);
});

test("normalizes Drive folder paths without traversal segments", () => {
  assert.deepEqual(splitDriveFolderPath("Magic Conch\\reports/2026/../final"), ["Magic Conch", "reports", "2026", "final"]);
});
