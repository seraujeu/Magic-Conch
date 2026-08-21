import { unzipSync } from "fflate";

export type PromptFileAsset = {
  name: string;
  type: string;
  data: string;
  size: number;
};

function isPromptFileAsset(value: unknown): value is PromptFileAsset {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PromptFileAsset>;
  return typeof candidate.name === "string"
    && typeof candidate.type === "string"
    && typeof candidate.data === "string"
    && typeof candidate.size === "number";
}

/**
 * Turns file values flowing through aggregate nodes into one flat collection.
 * A Join node can produce nested arrays when each of its inputs already contains
 * several files, so file-consuming nodes must not assume a single array level.
 */
export function collectFileAssets(...values: unknown[]): PromptFileAsset[] {
  const files: PromptFileAsset[] = [];
  const seenObjects = new WeakSet<object>();
  const seenByMetadata = new Map<string, PromptFileAsset[]>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isPromptFileAsset(value)) return;
    if (seenObjects.has(value)) return;
    seenObjects.add(value);
    const identity = `${value.name}\0${value.type}\0${value.size}`;
    const matches = seenByMetadata.get(identity);
    if (matches?.some((candidate) => candidate.data === value.data)) return;
    if (matches) matches.push(value);
    else seenByMetadata.set(identity, [value]);
    files.push(value);
  };
  values.forEach(visit);
  return files;
}

const MAX_FILE_TEXT_LENGTH = 120_000;
const textDecoder = new TextDecoder("utf-8");

function decodeXml(value: string) {
  return value
    .replace(/&#(x[\da-f]+|\d+);/gi, (_match, code: string) =>
      String.fromCodePoint(code[0].toLowerCase() === "x" ? Number.parseInt(code.slice(1), 16) : Number.parseInt(code, 10)),
    )
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function dataUrlBytes(dataUrl: string) {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("The uploaded file has an invalid data URL.");
  const metadata = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  if (!metadata.includes(";base64")) return new TextEncoder().encode(decodeURIComponent(payload));
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function xmlText(xml: string) {
  return Array.from(xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g))
    .map((match) => decodeXml(match[1]))
    .join("");
}

function spreadsheetColumnIndex(reference: string) {
  const letters = reference.match(/^[A-Z]+/i)?.[0].toUpperCase() || "A";
  return [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function workbookText(bytes: Uint8Array) {
  const archive = unzipSync(bytes);
  const readEntry = (path: string) => {
    const entry = archive[path.replace(/^\//, "")];
    return entry ? textDecoder.decode(entry) : "";
  };
  const workbook = readEntry("xl/workbook.xml");
  const relationships = readEntry("xl/_rels/workbook.xml.rels");
  if (!workbook || !relationships) throw new Error("The workbook is missing its worksheet index.");

  const relationshipTargets = new Map(
    Array.from(relationships.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)).map((match) => {
      const attributes = match[1];
      const id = attributes.match(/\bId="([^"]+)"/)?.[1] || "";
      const target = attributes.match(/\bTarget="([^"]+)"/)?.[1] || "";
      const normalized = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
      return [id, normalized.replace(/\\/g, "/")] as const;
    }),
  );
  const sharedStrings = Array.from(readEntry("xl/sharedStrings.xml").matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g))
    .map((match) => xmlText(match[1]));
  const sheets = Array.from(workbook.matchAll(/<sheet\b([^>]*)\/?\s*>/g)).map((match, index) => {
    const attributes = match[1];
    return {
      name: decodeXml(attributes.match(/\bname="([^"]*)"/)?.[1] || `Sheet ${index + 1}`),
      path: relationshipTargets.get(attributes.match(/\br:id="([^"]+)"/)?.[1] || "") || `xl/worksheets/sheet${index + 1}.xml`,
    };
  });

  return sheets.map((sheet) => {
    const worksheet = readEntry(sheet.path);
    const rows = Array.from(worksheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)).map((rowMatch) => {
      const values: string[] = [];
      for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const attributes = cellMatch[1];
        const body = cellMatch[2];
        const column = spreadsheetColumnIndex(attributes.match(/\br="([^"]+)"/)?.[1] || "A1");
        const type = attributes.match(/\bt="([^"]+)"/)?.[1] || "";
        const rawValue = body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1] || "";
        const value = type === "s"
          ? sharedStrings[Number(rawValue)] || ""
          : type === "inlineStr"
            ? xmlText(body)
            : type === "b"
              ? (rawValue === "1" ? "TRUE" : "FALSE")
              : decodeXml(rawValue);
        values[column] = value.replace(/\r?\n/g, " ");
      }
      while (values.length && !values.at(-1)) values.pop();
      return values.map((value) => value || "").join("\t");
    });
    return `Sheet: ${sheet.name}\n${rows.join("\n")}`;
  }).join("\n\n");
}

function wordDocumentText(bytes: Uint8Array) {
  const archive = unzipSync(bytes);
  const document = archive["word/document.xml"];
  if (!document) throw new Error("The Word document is missing its main content.");
  return textDecoder.decode(document)
    .replace(/<w:tab\s*\/>/g, "\t")
    .replace(/<w:br\s*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .split("\n")
    .map((line) => decodeXml(line).trim())
    .filter(Boolean)
    .join("\n");
}

function isPlainTextFile(file: PromptFileAsset) {
  return file.type.startsWith("text/")
    || file.type.includes("json")
    || /\.(?:csv|tsv|txt|md|markdown|json|jsonl|xml|ya?ml|html?|css|jsx?|tsx?|py|rb|go|rs|java|kt|sql|log|ini|toml)$/i.test(file.name);
}

export function fileAssetPromptSection(file: PromptFileAsset) {
  const supported = /\.(?:xlsx|xlsm|docx)$/i.test(file.name) || isPlainTextFile(file);
  if (!supported) {
    return `Attached file: ${file.name} (${file.type || "unknown type"}, ${file.size} bytes)\n[Binary content is attached separately when supported by the selected provider.]`;
  }

  let content = "";
  try {
    const bytes = dataUrlBytes(file.data);
    if (/\.(?:xlsx|xlsm)$/i.test(file.name)) content = workbookText(bytes);
    else if (/\.docx$/i.test(file.name)) content = wordDocumentText(bytes);
    else if (isPlainTextFile(file)) content = textDecoder.decode(bytes);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Attached file: ${file.name} (${file.type || "unknown type"}, ${file.size} bytes)\n[Content extraction failed: ${message}]`;
  }

  if (!content) {
    return `Attached file: ${file.name} (${file.type || "unknown type"}, ${file.size} bytes)\n[Binary content is attached separately when supported by the selected provider.]`;
  }
  const truncated = content.length > MAX_FILE_TEXT_LENGTH
    ? `${content.slice(0, MAX_FILE_TEXT_LENGTH)}\n[Content truncated after ${MAX_FILE_TEXT_LENGTH.toLocaleString()} characters.]`
    : content;
  return `File: ${file.name}\n${truncated}`;
}

export function fileAssetsPromptSections(files: PromptFileAsset[]) {
  return files.map(fileAssetPromptSection);
}
