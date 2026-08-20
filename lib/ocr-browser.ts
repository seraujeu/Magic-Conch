"use client";

import {
  formatOcrPages,
  isOcrSupportedAsset,
  isPdfAsset,
  normalizeOcrLanguages,
  ocrOutputFileNames,
  parseOcrPageSelection,
} from "./ocr";
import type { OcrInputAsset, OcrLayout, OcrPreprocess, OcrProgress, OcrResult } from "./ocr";

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
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `${window.location.origin}/pdfjs/pdf.worker.min.mjs`;
  const loadingTask = pdfjs.getDocument({
    data: dataUrlBytes(file.data),
    useWasm: true,
    wasmUrl: `${window.location.origin}/pdfjs-wasm/`,
  });
  return { loadingTask, pdf: await loadingTask.promise };
}

function preprocessCanvas(canvas: HTMLCanvasElement, mode: OcrPreprocess) {
  if (mode === "none") return canvas;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("The browser could not prepare this image for OCR.");
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = image.data;
  for (let index = 0; index < pixels.length; index += 4) {
    const luminance = Math.round(0.299 * pixels[index] + 0.587 * pixels[index + 1] + 0.114 * pixels[index + 2]);
    const value = mode === "binary"
      ? (luminance >= 170 ? 255 : 0)
      : mode === "contrast"
        ? Math.max(0, Math.min(255, Math.round((luminance - 128) * 1.65 + 128)))
        : luminance;
    pixels[index] = value;
    pixels[index + 1] = value;
    pixels[index + 2] = value;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

async function preprocessImage(file: OcrInputAsset, mode: OcrPreprocess) {
  if (mode === "none") return file.data;
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`Could not decode ${file.name} for OCR.`));
    image.src = file.data;
  });
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext("2d")?.drawImage(image, 0, 0);
  preprocessCanvas(canvas, mode);
  return canvas;
}

type BrowserOcrOptions = {
  languages?: string;
  pdfScale?: number;
  pages?: string;
  layout?: OcrLayout;
  preprocess?: OcrPreprocess;
  autoRotate?: boolean;
  preserveSpacing?: boolean;
  includePageSeparators?: boolean;
};

export async function prepareVisionOcrInputs(
  file: OcrInputAsset,
  pdfScale = 2,
  onPage?: (page: number, pageCount: number) => void,
  options: Pick<BrowserOcrOptions, "pages" | "preprocess"> = {},
) {
  requireBrowser();
  const preprocess = options.preprocess || "none";
  if (!isPdfAsset(file)) {
    const prepared = await preprocessImage(file, preprocess);
    if (prepared instanceof HTMLCanvasElement) {
      const data = prepared.toDataURL("image/png");
      return { files: [{ ...file, type: "image/png", data, size: Math.floor(data.length * 0.75) }], pageCount: 1, pageNumbers: [1], totalPageCount: 1 };
    }
    return { files: [file], pageCount: 1, pageNumbers: [1], totalPageCount: 1 };
  }
  const { loadingTask, pdf } = await openPdf(file);
  const files: OcrInputAsset[] = [];
  const baseName = file.name.replace(/\.pdf$/i, "") || "document";
  const pageNumbers = parseOcrPageSelection(options.pages, pdf.numPages);
  try {
    for (let pageIndex = 0; pageIndex < pageNumbers.length; pageIndex += 1) {
      const pageNumber = pageNumbers[pageIndex];
      onPage?.(pageIndex + 1, pageNumbers.length);
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: Math.max(1, Math.min(4, pdfScale)) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      preprocessCanvas(canvas, preprocess);
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
  return { files, pageCount: files.length, pageNumbers, totalPageCount: pdf.numPages };
}

export async function performOcr(
  files: OcrInputAsset[],
  options: BrowserOcrOptions = {},
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
  const { createWorker, OEM, PSM } = await import("tesseract.js");
  let activeProgress = { fileIndex: 0, fileName: files[0].name, page: 1, pageCount: 1 };
  const worker = await createWorker(languages, OEM.LSTM_ONLY, {
    logger: (message) => onProgress?.({
      ...activeProgress,
      fileCount: files.length,
      status: message.status,
      progress: message.progress,
    }),
  });
  const segmentation = {
    auto: PSM.AUTO,
    "single-column": PSM.SINGLE_COLUMN,
    "single-block": PSM.SINGLE_BLOCK,
    sparse: PSM.SPARSE_TEXT,
    "single-line": PSM.SINGLE_LINE,
  }[options.layout || "auto"];
  await worker.setParameters({
    tessedit_pageseg_mode: segmentation,
    preserve_interword_spaces: options.preserveSpacing === false ? "0" : "1",
  });

  try {
    const results: OcrResult[] = [];
    for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
      const file = files[fileIndex];
      if (!isPdfAsset(file)) {
        activeProgress = { fileIndex, fileName: file.name, page: 1, pageCount: 1 };
        const prepared = await preprocessImage(file, options.preprocess || "none");
        const recognized = await worker.recognize(prepared, { rotateAuto: options.autoRotate !== false });
        results.push({
          sourceName: file.name,
          outputName: outputNames[fileIndex],
          text: recognized.data.text,
          pageCount: 1,
          confidence: recognized.data.confidence,
          pages: [1],
        });
        continue;
      }

      const { loadingTask, pdf } = await openPdf(file);
      const pageTexts: string[] = [];
      const confidences: number[] = [];
      const pageNumbers = parseOcrPageSelection(options.pages, pdf.numPages);
      try {
        for (let pageIndex = 0; pageIndex < pageNumbers.length; pageIndex += 1) {
          const pageNumber = pageNumbers[pageIndex];
          activeProgress = { fileIndex, fileName: file.name, page: pageIndex + 1, pageCount: pageNumbers.length };
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: Math.max(1, Math.min(4, options.pdfScale || 2)) });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          await page.render({ canvas, viewport }).promise;
          preprocessCanvas(canvas, options.preprocess || "none");
          const recognized = await worker.recognize(canvas, { rotateAuto: options.autoRotate !== false });
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
        text: formatOcrPages(pageTexts, pageNumbers, options.includePageSeparators !== false),
        pageCount: pageTexts.length,
        confidence: confidences.length ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : 0,
        pages: pageNumbers,
      });
    }
    return results;
  } finally {
    await worker.terminate();
  }
}
