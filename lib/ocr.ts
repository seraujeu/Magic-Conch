export type OcrInputAsset = {
  name: string;
  type: string;
  data: string;
  size: number;
};

export type OcrEngine = "tesseract" | "openai" | "gemini" | "claude" | "ollama";
export type OcrLayout = "auto" | "single-column" | "single-block" | "sparse" | "single-line";
export type OcrPreprocess = "none" | "grayscale" | "contrast" | "binary";

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
  pages?: number[];
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

export function parseOcrPageSelection(value: string | undefined, pageCount: number) {
  if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error("The PDF has no readable pages.");
  const selection = value?.trim().toLowerCase();
  if (!selection || selection === "all") return Array.from({ length: pageCount }, (_, index) => index + 1);

  const pages = new Set<number>();
  for (const part of selection.split(",")) {
    const token = part.trim();
    const match = /^(\d+|last)?\s*(?:-\s*(\d+|last)?)?$/.exec(token);
    if (!match || (!match[1] && !match[2])) {
      throw new Error('PDF pages must look like "all", "1-3, 5", "3-", or "last".');
    }
    const resolve = (raw: string | undefined, fallback: number) => raw === "last" ? pageCount : raw ? Number(raw) : fallback;
    const start = resolve(match[1], 1);
    const end = match[0].includes("-") ? resolve(match[2], pageCount) : start;
    if (start < 1 || end < 1 || start > pageCount || end > pageCount || start > end) {
      throw new Error(`PDF page selection must stay between 1 and ${pageCount}.`);
    }
    for (let page = start; page <= end; page += 1) pages.add(page);
  }
  return [...pages].sort((a, b) => a - b);
}

export function formatOcrPages(pageTexts: string[], pageNumbers?: number[], includePageSeparators = true) {
  const cleaned = pageTexts.map((text) => text.trim());
  if (!includePageSeparators || cleaned.length === 1) return cleaned.filter(Boolean).join("\n\n");
  return cleaned
    .map((text, index) => `--- Page ${pageNumbers?.[index] ?? index + 1} ---\n\n${text}`)
    .join("\n\n");
}

const OCR_LAYOUT_DESCRIPTIONS: Record<OcrLayout, string> = {
  auto: "infer the natural document layout and reading order",
  "single-column": "treat the page as one column of text",
  "single-block": "treat the page as one uniform block of text",
  sparse: "find scattered text without assuming a continuous document",
  "single-line": "treat the image as a single line of text",
};

export function visionOcrPrompt(
  fileName: string,
  languages?: string,
  options: { layout?: OcrLayout; preserveSpacing?: boolean; guidance?: string } = {},
) {
  const layout = options.layout || "auto";
  return [
    `Perform OCR on ${fileName}.`,
    `Recognition language: ${ocrLanguageDescription(languages)}.`,
    `Layout: ${OCR_LAYOUT_DESCRIPTIONS[layout]}.`,
    "Return only the extracted text, with no commentary or code fences.",
    options.preserveSpacing === false
      ? "Preserve reading order and meaningful line breaks, but normalize excessive spacing."
      : "Preserve reading order, meaningful line breaks, headings, columns, spacing, and table structure as plain text.",
    "Do not summarize, translate, correct, or invent text. Mark unreadable fragments as [unclear].",
    options.guidance?.trim() ? `Additional recognition guidance: ${options.guidance.trim()}` : "",
  ].filter(Boolean).join("\n");
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
