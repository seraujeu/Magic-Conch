export function workflowExportFilename(name: string): string {
  const stem = name
    .normalize("NFC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  return `${stem || "workflow"}.json`;
}

export function workflowArchiveFilename(name: string): string {
  return workflowExportFilename(name).replace(/\.json$/i, ".zip");
}

export function workflowFileText(text: string): string {
  return text.replace(/^\uFEFF/, "");
}
