export type OcrInputAsset = {
  name: string;
  type: string;
  data: string;
  size: number;
};

export type OcrEngine = "tesseract" | "openai" | "gemini" | "claude" | "ollama";

export const OCR_LANGUAGE_OPTIONS = [
  { code: "eng", label: "English" },
  { code: "kor", label: "Korean" },
  { code: "jpn", label: "Japanese" },
  { code: "chi_sim", label: "Chinese (Simplified)" },
  { code: "chi_tra", label: "Chinese (Traditional)" },
  { code: "spa", label: "Spanish" },
  { code: "fra", label: "French" },
  { code: "deu", label: "German" },
  { code: "ita", label: "Italian" },
  { code: "por", label: "Portuguese" },
  { code: "nld", label: "Dutch" },
  { code: "pol", label: "Polish" },
  { code: "rus", label: "Russian" },
  { code: "ukr", label: "Ukrainian" },
  { code: "tur", label: "Turkish" },
  { code: "ara", label: "Arabic" },
  { code: "hin", label: "Hindi" },
  { code: "tha", label: "Thai" },
  { code: "vie", label: "Vietnamese" },
  { code: "ind", label: "Indonesian" },
] as const;

const OCR_LANGUAGE_LABELS = new Map<string, string>(
  OCR_LANGUAGE_OPTIONS.map((language) => [language.code, language.label]),
);

export type OcrResult = {
  sourceName: string;
  outputName: string;
  text: string;
  pageCount: number;
  confidence: number | null;
};

export type OcrProgress = {
  fileIndex: number;
  fileCount: number;
  fileName: string;
  page: number;
  pageCount: number;
  status: string;
  progress: number;
};

const OCR_IMAGE_EXTENSION = /\.(?:avif|bmp|gif|jpe?g|png|pnm|pbm|pgm|ppm|tiff?|webp)$/i;

export function isOcrSupportedAsset(file: OcrInputAsset) {
  return file.type.startsWith("image/")
    || OCR_IMAGE_EXTENSION.test(file.name)
    || file.type === "application/pdf"
    || /\.pdf$/i.test(file.name);
}

export function normalizeOcrLanguages(value?: string) {
  const languages = (value || "eng")
    .split(/[+,\s]+/)
    .map((language) => language.trim().toLowerCase())
    .filter(Boolean);
  if (!languages.length) return ["eng"];
  if (languages.some((language) => !/^[a-z0-9_-]+$/i.test(language))) {
    throw new Error("OCR languages must use Tesseract language codes such as eng or eng+kor.");
  }
  return [...new Set(languages)];
}

export function configuredOcrLanguages(config: {
  ocrLanguages?: string;
  ocrPrimaryLanguage?: string;
  ocrAdditionalLanguages?: string;
}) {
  const legacy = normalizeOcrLanguages(config.ocrLanguages);
  const primary = config.ocrPrimaryLanguage || legacy[0] || "eng";
  if (primary === "auto") return "auto";
  const additional = config.ocrAdditionalLanguages === undefined
    ? legacy.slice(1)
    : config.ocrAdditionalLanguages.trim()
      ? normalizeOcrLanguages(config.ocrAdditionalLanguages)
      : [];
  return [...new Set([primary, ...additional])].join("+");
}

export function ocrLanguageDescription(value?: string) {
  if (value === "auto") return "automatically detect every language present";
  return normalizeOcrLanguages(value)
    .map((code) => OCR_LANGUAGE_LABELS.get(code) || code)
    .join(" and ");
}

export function visionOcrPrompt(fileName: string, languages?: string) {
  return [
    `Perform OCR on ${fileName}.`,
    `Recognition language: ${ocrLanguageDescription(languages)}.`,
    "Return only the extracted text, with no commentary or code fences.",
    "Preserve reading order, meaningful line breaks, headings, and table structure as plain text.",
    "For a multi-page document, separate pages with headings in the exact form: --- Page N ---",
    "Do not summarize, translate, correct, or invent text. Mark unreadable fragments as [unclear].",
  ].join("\n");
}

export function ocrOutputFileNames(sourceNames: string[]) {
  const used = new Map<string, number>();
  return sourceNames.map((sourceName) => {
    const base = sourceName.replace(/\.[^.]+$/, "") || "ocr-result";
    const normalized = base.toLocaleLowerCase();
    const occurrence = (used.get(normalized) || 0) + 1;
    used.set(normalized, occurrence);
    return `${base}${occurrence > 1 ? ` (${occurrence})` : ""}.ocr.txt`;
  });
}

export function combineOcrResults(results: Pick<OcrResult, "sourceName" | "text">[]) {
  if (results.length === 1) return results[0].text.trim();
  return results
    .map((result) => `## ${result.sourceName}\n\n${result.text.trim()}`)
    .join("\n\n---\n\n");
}

export function isPdfAsset(file: OcrInputAsset) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}
