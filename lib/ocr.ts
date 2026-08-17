export type OcrInputAsset = {
  name: string;
  type: string;
  data: string;
  size: number;
};

export type OcrResult = {
  sourceName: string;
  outputName: string;
  text: string;
  pageCount: number;
  confidence: number;
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

function dataUrlBytes(dataUrl: string) {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("The OCR input has an invalid data URL.");
  const metadata = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  if (!metadata.includes(";base64")) return new TextEncoder().encode(decodeURIComponent(payload));
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function isPdfAsset(file: OcrInputAsset) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

export async function performOcr(
  files: OcrInputAsset[],
  options: { languages?: string; pdfScale?: number } = {},
  onProgress?: (progress: OcrProgress) => void,
): Promise<OcrResult[]> {
  if (!files.length) throw new Error("Connect at least one image or PDF document to the OCR node.");
  const unsupported = files.filter((file) => !isOcrSupportedAsset(file));
  if (unsupported.length) {
    throw new Error(`OCR supports images and PDF documents. Unsupported: ${unsupported.map((file) => file.name).join(", ")}.`);
  }
  if (typeof document === "undefined") throw new Error("OCR requires a browser environment.");

  const languages = normalizeOcrLanguages(options.languages);
  const outputNames = ocrOutputFileNames(files.map((file) => file.name));
  const { createWorker, OEM } = await import("tesseract.js");
  let activeProgress = { fileIndex: 0, fileName: files[0].name, page: 1, pageCount: 1 };
  const worker = await createWorker(languages, OEM.LSTM_ONLY, {
    logger: (message) => onProgress?.({
      ...activeProgress,
      fileCount: files.length,
      status: message.status,
      progress: message.progress,
    }),
  });

  try {
    const results: OcrResult[] = [];
    for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
      const file = files[fileIndex];
      if (!isPdfAsset(file)) {
        activeProgress = { fileIndex, fileName: file.name, page: 1, pageCount: 1 };
        const recognized = await worker.recognize(file.data);
        results.push({
          sourceName: file.name,
          outputName: outputNames[fileIndex],
          text: recognized.data.text,
          pageCount: 1,
          confidence: recognized.data.confidence,
        });
        continue;
      }

      const [pdfjs, pdfWorker] = await Promise.all([
        import("pdfjs-dist"),
        import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
      ]);
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker.default;
      const loadingTask = pdfjs.getDocument({ data: dataUrlBytes(file.data), useWasm: false });
      const pdf = await loadingTask.promise;
      const pageTexts: string[] = [];
      const confidences: number[] = [];
      try {
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          activeProgress = { fileIndex, fileName: file.name, page: pageNumber, pageCount: pdf.numPages };
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: Math.max(1, Math.min(4, options.pdfScale || 2)) });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          await page.render({ canvas, viewport }).promise;
          const recognized = await worker.recognize(canvas);
          pageTexts.push(recognized.data.text.trim());
          confidences.push(recognized.data.confidence);
          page.cleanup();
        }
      } finally {
        await loadingTask.destroy();
      }
      results.push({
        sourceName: file.name,
        outputName: outputNames[fileIndex],
        text: pageTexts.map((text, index) => `--- Page ${index + 1} ---\n\n${text}`).join("\n\n"),
        pageCount: pageTexts.length,
        confidence: confidences.length ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : 0,
      });
    }
    return results;
  } finally {
    await worker.terminate();
  }
}
