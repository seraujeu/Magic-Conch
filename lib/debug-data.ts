export type DebugFileMetadata = {
  name: string;
  type: string;
  size: number;
  contentOmitted: true;
};

type DebugDatumLike = { value: unknown };

const MAX_DEBUG_STRING_LENGTH = 20_000;
const MAX_DEBUG_COLLECTION_ITEMS = 100;
const MAX_DEBUG_DEPTH = 8;

function isEmbeddedFile(value: Record<string, unknown>) {
  return typeof value.name === "string"
    && typeof value.type === "string"
    && typeof value.size === "number"
    && typeof value.data === "string";
}

function isDebugFile(value: Record<string, unknown>): value is DebugFileMetadata {
  return typeof value.name === "string"
    && typeof value.type === "string"
    && typeof value.size === "number"
    && value.contentOmitted === true;
}

export function sanitizeDebugValue(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (typeof value === "string") {
    return value.length > MAX_DEBUG_STRING_LENGTH
      ? `${value.slice(0, MAX_DEBUG_STRING_LENGTH)}\n[Debug preview truncated after ${MAX_DEBUG_STRING_LENGTH.toLocaleString()} characters.]`
      : value;
  }
  if (!value || typeof value !== "object") return value;
  if (depth >= MAX_DEBUG_DEPTH) return "[Debug preview depth limit reached]";
  if (seen.has(value)) return "[Circular or repeated reference]";
  seen.add(value);

  if (Array.isArray(value)) {
    const preview = value
      .slice(0, MAX_DEBUG_COLLECTION_ITEMS)
      .map((item) => sanitizeDebugValue(item, depth + 1, seen));
    if (value.length > MAX_DEBUG_COLLECTION_ITEMS) {
      preview.push(`[${value.length - MAX_DEBUG_COLLECTION_ITEMS} additional items omitted]`);
    }
    return preview;
  }

  const record = value as Record<string, unknown>;
  if (isEmbeddedFile(record)) {
    return {
      name: record.name,
      type: record.type,
      size: record.size,
      contentOmitted: true,
    } satisfies DebugFileMetadata;
  }

  const entries = Object.entries(record);
  const preview = Object.fromEntries(
    entries
      .slice(0, MAX_DEBUG_COLLECTION_ITEMS)
      .map(([key, item]) => [key, sanitizeDebugValue(item, depth + 1, seen)]),
  );
  if (entries.length > MAX_DEBUG_COLLECTION_ITEMS) {
    preview.__debugOmittedProperties = entries.length - MAX_DEBUG_COLLECTION_ITEMS;
  }
  return preview;
}

export function sanitizeDebugData<T extends DebugDatumLike>(items: T[]): T[] {
  return items.map((item) => ({ ...item, value: sanitizeDebugValue(item.value) }));
}

export function collectDebugFiles(value: unknown): DebugFileMetadata[] {
  const files: DebugFileMetadata[] = [];
  const seen = new WeakSet<object>();
  const visit = (item: unknown) => {
    if (!item || typeof item !== "object" || seen.has(item)) return;
    seen.add(item);
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    const record = item as Record<string, unknown>;
    if (isDebugFile(record)) {
      files.push(record);
      return;
    }
    Object.values(record).forEach(visit);
  };
  visit(value);
  return files;
}
