"use client";

import {
  isOcrSupportedAsset,
  isPdfAsset,
  normalizeOcrLanguages,
  ocrOutputFileNames,
} from "./ocr";
import type { OcrInputAsset, OcrProgress, OcrResult } from "./ocr";

function requireBrowser() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("OCR requires a browser environment.");
  }
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

async function openPdf(file: OcrInputAsset) {
  requireBrowser();
  const [pdfjs, pdfWorker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker.default;
  const loadingTask = pdfjs.getDocument({ data: dataUrlBytes(file.data), useWasm: false });
  return { loadingTask, pdf: await loadingTask.promise };
}

export async function prepareVisionOcrInputs(
  file: OcrInputAsset,
  pdfScale = 2,
  onPage?: (page: number, pageCount: number) => void,
) {
  requireBrowser();
  if (!isPdfAsset(file)) return { files: [file], pageCount: 1 };
  const { loadingTask, pdf } = await openPdf(file);
  const files: OcrInputAsset[] = [];
  const baseName = file.name.replace(/\.pdf$/i, "") || "document";
  const pageCount = pdf.numPages;
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      onPage?.(pageNumber, pdf.numPages);
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: Math.max(1, Math.min(4, pdfScale)) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      const data = canvas.toDataURL("image/png");
      files.push({
        name: `${baseName}-page-${pageNumber}.png`,
        type: "image/png",
        data,
        size: Math.floor((data.length - data.indexOf(",") - 1) * 0.75),
      });
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
  return { files, pageCount };
}

export async function performOcr(
  files: OcrInputAsset[],
  options: { languages?: string; pdfScale?: number } = {},
  onProgress?: (progress: OcrProgress) => void,
): Promise<OcrResult[]> {
  requireBrowser();
  if (!files.length) throw new Error("Connect at least one image or PDF document to the OCR node.");
  const unsupported = files.filter((file) => !isOcrSupportedAsset(file));
  if (unsupported.length) {
    throw new Error(`OCR supports images and PDF documents. Unsupported: ${unsupported.map((file) => file.name).join(", ")}.`);
  }

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

      const { loadingTask, pdf } = await openPdf(file);
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
