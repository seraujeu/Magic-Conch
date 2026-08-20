import assert from "node:assert/strict";
import test from "node:test";

import {
  combineOcrResults,
  configuredOcrLanguages,
  formatOcrPages,
  isOcrSupportedAsset,
  normalizeOcrLanguages,
  ocrLanguageDescription,
  ocrOutputFileNames,
  parseOcrPageSelection,
  visionOcrPrompt,
} from "../lib/ocr.ts";

const asset = (name, type) => ({ name, type, data: "data:;base64,", size: 0 });

test("accepts OCR images and PDF documents while rejecting other files", () => {
  assert.equal(isOcrSupportedAsset(asset("scan.PNG", "application/octet-stream")), true);
  assert.equal(isOcrSupportedAsset(asset("contract", "application/pdf")), true);
  assert.equal(isOcrSupportedAsset(asset("notes.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")), false);
});

test("normalizes one or more Tesseract language codes", () => {
  assert.deepEqual(normalizeOcrLanguages("eng+KOR, eng"), ["eng", "kor"]);
  assert.deepEqual(normalizeOcrLanguages(""), ["eng"]);
});

test("keeps legacy language settings and supports guided primary and additional languages", () => {
  assert.equal(configuredOcrLanguages({ ocrLanguages: "kor+eng" }), "kor+eng");
  assert.equal(configuredOcrLanguages({
    ocrLanguages: "eng",
    ocrPrimaryLanguage: "jpn",
    ocrAdditionalLanguages: "eng, kor",
  }), "jpn+eng+kor");
  assert.equal(configuredOcrLanguages({ ocrPrimaryLanguage: "auto", ocrAdditionalLanguages: "eng" }), "auto");
});

test("describes OCR languages clearly in the vision-engine transcription prompt", () => {
  assert.equal(ocrLanguageDescription("kor+eng"), "Korean and English");
  assert.match(visionOcrPrompt("scan.pdf", "auto"), /automatically detect every language/i);
  assert.match(visionOcrPrompt("scan.pdf", "eng"), /Return only the extracted text/);
  assert.match(visionOcrPrompt("receipt.png", "eng", { layout: "sparse", guidance: "Keep prices aligned" }), /scattered text/i);
  assert.match(visionOcrPrompt("receipt.png", "eng", { layout: "sparse", guidance: "Keep prices aligned" }), /Keep prices aligned/);
});

test("selects PDF pages with ranges, open ranges, and last", () => {
  assert.deepEqual(parseOcrPageSelection("all", 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(parseOcrPageSelection("1-2, 4, last", 6), [1, 2, 4, 6]);
  assert.deepEqual(parseOcrPageSelection("3-", 5), [3, 4, 5]);
  assert.throws(() => parseOcrPageSelection("4-2", 5), /between 1 and 5/);
  assert.throws(() => parseOcrPageSelection("one", 5), /PDF pages must look like/);
});

test("formats selected OCR pages with optional source page labels", () => {
  assert.equal(formatOcrPages([" Alpha ", "Beta"], [2, 5]), "--- Page 2 ---\n\nAlpha\n\n--- Page 5 ---\n\nBeta");
  assert.equal(formatOcrPages(["Alpha", "Beta"], [2, 5], false), "Alpha\n\nBeta");
});

test("creates a unique text export for every OCR input", () => {
  assert.deepEqual(
    ocrOutputFileNames(["invoice.png", "invoice.pdf", "receipt.jpg"]),
    ["invoice.ocr.txt", "invoice (2).ocr.txt", "receipt.ocr.txt"],
  );
});

test("preserves a clean single result and labels multiple OCR results", () => {
  assert.equal(combineOcrResults([{ sourceName: "a.png", text: "  Hello  " }]), "Hello");
  assert.equal(
    combineOcrResults([
      { sourceName: "a.png", text: "Alpha" },
      { sourceName: "b.pdf", text: "Beta" },
    ]),
    "## a.png\n\nAlpha\n\n---\n\n## b.pdf\n\nBeta",
  );
});
