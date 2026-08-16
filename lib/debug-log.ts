type DebugLogFile = {
  name: string;
  type: string;
  size: number;
  bundleLoadNodeId?: string;
};

export type DebugLogInput = {
  exportedAt: string;
  chat: unknown;
  workflow: unknown;
  run: unknown;
};

function filenameStem(value: string) {
  return value
    .normalize("NFC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function isEmbeddedFile(value: Record<string, unknown>): value is Record<string, unknown> & DebugLogFile {
  return typeof value.name === "string"
    && typeof value.type === "string"
    && typeof value.size === "number"
    && typeof value.data === "string";
}

/** Removes embedded file bytes while retaining useful attachment metadata. */
export function sanitizeDebugLogValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeDebugLogValue);
  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  if (isEmbeddedFile(record)) {
    return {
      name: record.name,
      type: record.type,
      size: record.size,
      ...(typeof record.bundleLoadNodeId === "string" ? { bundleLoadNodeId: record.bundleLoadNodeId } : {}),
      contentOmitted: true,
    };
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [key, sanitizeDebugLogValue(item)]),
  );
}

export function createDebugLog(input: DebugLogInput) {
  return {
    format: "magic-conch-debug-log",
    version: 1,
    exportedAt: input.exportedAt,
    chat: sanitizeDebugLogValue(input.chat),
    workflow: sanitizeDebugLogValue(input.workflow),
    run: sanitizeDebugLogValue(input.run),
  };
}

export function debugLogFilename(chatTitle: string, exportedAt: Date) {
  const timestamp = exportedAt.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-");
  return `${filenameStem(chatTitle) || "chat"}-debug-log-${timestamp}.json`;
}
