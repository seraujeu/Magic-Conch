import test from "node:test";
import assert from "node:assert/strict";
import { fileNameFromAsset, firstFileAsset } from "../lib/file-metadata.ts";

test("gets a file name with or without its final extension", () => {
  const asset = { name: "exports/archive/report.final.pdf" };
  assert.equal(fileNameFromAsset(asset, true), "report.final.pdf");
  assert.equal(fileNameFromAsset(asset, false), "report.final");
  assert.equal(fileNameFromAsset({ name: ".env" }, false), ".env");
});

test("finds the first file asset in nested media values", () => {
  const asset = { name: "clip.mp4", type: "video/mp4", data: "data:video/mp4;base64," };
  assert.strictEqual(firstFileAsset(undefined, [[], [asset]]), asset);
  assert.equal(firstFileAsset("not a file"), undefined);
});
