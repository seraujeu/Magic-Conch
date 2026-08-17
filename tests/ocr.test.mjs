import assert from "node:assert/strict";
import test from "node:test";

import {
  combineOcrResults,
  configuredOcrLanguages,
  isOcrSupportedAsset,
  normalizeOcrLanguages,
  ocrLanguageDescription,
  ocrOutputFileNames,
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
