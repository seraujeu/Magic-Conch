import assert from "node:assert/strict";
import test from "node:test";

import { strToU8, zipSync } from "fflate";
import { collectFileAssets, fileAssetPromptSection } from "../lib/file-content.ts";

function dataUrl(bytes, type) {
  return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
}

test("flattens and de-duplicates files combined from multiple node outputs", () => {
  const localFile = {
    name: "local.txt",
    type: "text/plain",
    data: dataUrl(Buffer.from("local"), "text/plain"),
    size: 5,
  };
  const userFile = {
    name: "user.txt",
    type: "text/plain",
    data: dataUrl(Buffer.from("user"), "text/plain"),
    size: 4,
  };

  assert.deepEqual(
    collectFileAssets([[localFile], [[userFile]]], localFile, undefined, "not a file"),
    [localFile, userFile],
  );
});

test("extracts UTF-8 text without corrupting non-ASCII characters", () => {
  const contents = "주소,상태\n서울,매물 있음";
  const section = fileAssetPromptSection({
    name: "properties.csv",
    type: "text/csv",
    data: dataUrl(Buffer.from(contents), "text/csv"),
    size: Buffer.byteLength(contents),
  });

  assert.match(section, /File: properties\.csv/);
  assert.match(section, /서울,매물 있음/);
});

test("extracts every worksheet in an uploaded Excel workbook", () => {
  const workbook = zipSync({
    "xl/workbook.xml": strToU8('<?xml version="1.0"?><workbook xmlns:r="relationships"><sheets><sheet name="현황" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    "xl/_rels/workbook.xml.rels": strToU8('<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    "xl/sharedStrings.xml": strToU8('<?xml version="1.0"?><sst><si><t>주소</t></si><si><t>서울</t></si><si><t>가격</t></si></sst>'),
    "xl/worksheets/sheet1.xml": strToU8('<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>2</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>450000</v></c></row></sheetData></worksheet>'),
  });
  const section = fileAssetPromptSection({
    name: "부동산 현황.xlsx",
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    data: dataUrl(workbook, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    size: workbook.length,
  });

  assert.match(section, /File: 부동산 현황\.xlsx/);
  assert.match(section, /Sheet: 현황/);
  assert.match(section, /주소\t가격/);
  assert.match(section, /서울\t450000/);
});

test("keeps unsupported binary attachments visible to the model", () => {
  const section = fileAssetPromptSection({
    name: "archive.bin",
    type: "application/octet-stream",
    data: dataUrl(Uint8Array.of(1, 2, 3), "application/octet-stream"),
    size: 3,
  });

  assert.match(section, /Attached file: archive\.bin/);
  assert.match(section, /Binary content is attached separately/);
});

test("does not decode unsupported binary attachments", () => {
  const section = fileAssetPromptSection({
    name: "large.pdf",
    type: "application/pdf",
    data: "data:application/pdf;base64,this-is-deliberately-invalid-base64%%%",
    size: 36_000_000,
  });

  assert.match(section, /Attached file: large\.pdf/);
  assert.doesNotMatch(section, /Content extraction failed/);
});

test("keeps distinct files with matching metadata", () => {
  const first = { name: "same.bin", type: "application/octet-stream", size: 3, data: "data:application/octet-stream;base64,AQID" };
  const second = { name: "same.bin", type: "application/octet-stream", size: 3, data: "data:application/octet-stream;base64,BAUG" };

  assert.deepEqual(collectFileAssets(first, first, second), [first, second]);
});
