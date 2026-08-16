import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

export type PortableFileAsset = {
  name: string;
  type: string;
  data: string;
  size: number;
  path?: string;
  bundleLoadNodeId?: string;
};

type PortableManifest = Record<string, unknown> & { files?: Partial<PortableFileAsset>[] };

export type PortableBundlePart = {
  manifest: PortableManifest;
  manifestPath: string;
};

const MIME_BY_EXTENSION: Record<string, string> = {
  css: "text/css",
  csv: "text/csv",
  gif: "image/gif",
  html: "text/html",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  js: "text/javascript",
  json: "application/json",
  md: "text/markdown",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  pdf: "application/pdf",
  png: "image/png",
  svg: "image/svg+xml",
  txt: "text/plain",
  wav: "audio/wav",
  webm: "video/webm",
  webp: "image/webp",
  xml: "application/xml",
  yaml: "application/yaml",
  yml: "application/yaml",
  zip: "application/zip",
};

function normalizeArchivePath(value: string) {
  const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "");
  const segments = normalized.split("/").filter((segment) => segment && segment !== ".");
  if (!segments.length || segments.some((segment) => segment === "..")) {
    throw new Error("The bundle contains an unsafe file path.");
  }
  return segments.join("/");
}

function relativeArchivePath(value: string) {
  return normalizeArchivePath(value).replace(/^files\//i, "");
}

function mimeTypeFor(name: string) {
  const extension = name.split(".").pop()?.toLocaleLowerCase() || "";
  return MIME_BY_EXTENSION[extension] || "application/octet-stream";
}

function base64ToBytes(value: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = value.replace(/\s/g, "").replace(/=+$/, "");
  const bytes = new Uint8Array(Math.floor((clean.length * 6) / 8));
  let buffer = 0;
  let bits = 0;
  let offset = 0;
  for (const character of clean) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) throw new Error("A bundled file has invalid base64 data.");
    buffer = (buffer << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[offset++] = (buffer >> bits) & 0xff;
    }
  }
  return offset === bytes.length ? bytes : bytes.slice(0, offset);
}

function bytesToBase64(bytes: Uint8Array) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const b = bytes[index + 1];
    const c = bytes[index + 2];
    result += alphabet[a >> 2];
    result += alphabet[((a & 3) << 4) | ((b ?? 0) >> 4)];
    result += index + 1 < bytes.length ? alphabet[((b & 15) << 2) | ((c ?? 0) >> 6)] : "=";
    result += index + 2 < bytes.length ? alphabet[c & 63] : "=";
  }
  return result;
}

function dataUrlBytes(data: string) {
  const match = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(data);
  if (!match) throw new Error("A bundled file does not contain a valid data URL.");
  if (match[2]) return base64ToBytes(match[3]);
  return strToU8(decodeURIComponent(match[3]));
}

function bytesToDataUrl(bytes: Uint8Array, type: string) {
  return `data:${type || "application/octet-stream"};base64,${bytesToBase64(bytes)}`;
}

function portableFileMetadata(file: Partial<PortableFileAsset>) {
  const metadata = { ...file };
  delete metadata.data;
  delete metadata.path;
  return metadata;
}

function uniqueBundlePath(name: string, used: Set<string>, filesRoot = "files/") {
  const relative = relativeArchivePath(name || "file");
  const dot = relative.lastIndexOf(".");
  const stem = dot > relative.lastIndexOf("/") ? relative.slice(0, dot) : relative;
  const extension = dot > relative.lastIndexOf("/") ? relative.slice(dot) : "";
  let candidate = `${filesRoot}${relative}`;
  let suffix = 2;
  while (used.has(candidate.toLocaleLowerCase())) candidate = `${filesRoot}${stem}-${suffix++}${extension}`;
  used.add(candidate.toLocaleLowerCase());
  return candidate;
}

function portablePathSegment(value: string, fallback: string) {
  return value.normalize("NFC").replace(/[^\p{L}\p{M}\p{N}_.-]+/gu, "-").replace(/^-+|-+$/g, "") || fallback;
}

function addPortableBundlePart(archive: Record<string, Uint8Array>, part: PortableBundlePart) {
  const manifestPath = normalizeArchivePath(part.manifestPath);
  const manifestFolder = manifestPath.includes("/") ? manifestPath.slice(0, manifestPath.lastIndexOf("/") + 1) : "";
  const filesRoot = `${manifestFolder}files/`;
  const files = Array.isArray(part.manifest.files) ? part.manifest.files : [];
  const used = new Set<string>();
  const loadNodeFolders = new Map<string, string>();
  const hasRuntimeFiles = files.some((file) => Boolean(file.bundleLoadNodeId));
  const bundledFiles = files.map((file, index) => {
    if (!file.data || !file.name) throw new Error(`Bundled file ${index + 1} is incomplete.`);
    let assetRoot = hasRuntimeFiles ? `${filesRoot}workflow-files/` : filesRoot;
    if (file.bundleLoadNodeId) {
      let folder = loadNodeFolders.get(file.bundleLoadNodeId);
      if (!folder) {
        folder = `${loadNodeFolders.size + 1}-${portablePathSegment(file.bundleLoadNodeId, "load")}`;
        loadNodeFolders.set(file.bundleLoadNodeId, folder);
      }
      assetRoot = `${filesRoot}load-nodes/${folder}/`;
    }
    const archivePath = uniqueBundlePath(file.name, used, assetRoot);
    const bytes = dataUrlBytes(file.data);
    archive[archivePath] = bytes;
    return {
      ...file,
      data: undefined,
      path: archivePath.slice(manifestFolder.length),
      type: file.type || mimeTypeFor(file.name),
      size: bytes.length,
    };
  });
  archive[manifestPath] = strToU8(JSON.stringify({ ...part.manifest, files: bundledFiles }, null, 2));
}

export function createPortableBundles(parts: PortableBundlePart[]) {
  const archive: Record<string, Uint8Array> = {};
  for (const part of parts) addPortableBundlePart(archive, part);
  return zipSync(archive, { level: 6 });
}

export function createPortableBundle(manifest: PortableManifest, manifestFilename: string) {
  return createPortableBundles([{ manifest, manifestPath: manifestFilename }]);
}

type PortableArchiveEntry = readonly [string, Uint8Array];

function readPortableEntries(bytes: Uint8Array): PortableArchiveEntry[] {
  let fileCount = 0;
  let expandedSize = 0;
  const archive = unzipSync(bytes, { filter: (entry) => {
    normalizeArchivePath(entry.name);
    fileCount += 1;
    expandedSize += entry.originalSize;
    if (fileCount > 10_000 || expandedSize > 512 * 1024 * 1024) {
      throw new Error("The bundle is too large to import safely.");
    }
    return !entry.name.endsWith("/");
  } });
  return Object.entries(archive).map(([path, data]) => [normalizeArchivePath(path), data] as const);
}

function hydratePortableManifest(entries: PortableArchiveEntry[], manifestEntry: PortableArchiveEntry) {
  const manifest = JSON.parse(strFromU8(manifestEntry[1]).replace(/^\uFEFF/, "")) as PortableManifest;
  const manifestFolder = manifestEntry[0].includes("/") ? manifestEntry[0].slice(0, manifestEntry[0].lastIndexOf("/") + 1) : "";
  const byPath = new Map(entries.map(([path, data]) => [path.toLocaleLowerCase(), { path, data }]));
  const listed = Array.isArray(manifest.files) ? manifest.files : [];
  const consumed = new Set<string>();
  const files: PortableFileAsset[] = listed.map((file, index) => {
    if (file.data && file.name) {
      return {
        ...portableFileMetadata(file),
        name: file.name,
        type: file.type || mimeTypeFor(file.name),
        data: file.data,
        size: file.size || dataUrlBytes(file.data).length,
      };
    }
    const reference = String(file.path || file.name || "");
    if (!reference) throw new Error(`Bundled file ${index + 1} has no path.`);
    const normalized = normalizeArchivePath(reference);
    const candidates = [normalized, `${manifestFolder}${normalized}`];
    if (!normalized.toLocaleLowerCase().startsWith("files/")) {
      candidates.push(`files/${normalized}`, `${manifestFolder}files/${normalized}`);
    }
    const entry = candidates.map((candidate) => byPath.get(candidate.toLocaleLowerCase())).find(Boolean);
    if (!entry) throw new Error(`The bundled file “${reference}” is missing.`);
    consumed.add(entry.path.toLocaleLowerCase());
    const name = file.name || relativeArchivePath(entry.path.slice(manifestFolder.length));
    const type = file.type || mimeTypeFor(name);
    return { ...portableFileMetadata(file), name, type, data: bytesToDataUrl(entry.data, type), size: entry.data.length };
  });

  const filesRoot = `${manifestFolder}files/`.toLocaleLowerCase();
  for (const [path, data] of entries) {
    const lower = path.toLocaleLowerCase();
    if (!lower.startsWith(filesRoot) || lower.endsWith("/") || consumed.has(lower)) continue;
    const name = path.slice(filesRoot.length);
    const type = mimeTypeFor(name);
    files.push({ name, type, data: bytesToDataUrl(data, type), size: data.length });
  }
  return { ...manifest, files };
}

export function readPortableBundle(bytes: Uint8Array, manifestFilename: string): PortableManifest {
  const entries = readPortableEntries(bytes);
  const wanted = normalizeArchivePath(manifestFilename).toLocaleLowerCase();
  const manifestEntry = entries.find(([path]) => path.toLocaleLowerCase() === wanted)
    || entries.find(([path]) => path.split("/").pop()?.toLocaleLowerCase() === wanted)
    || entries.find(([path]) => {
      const lower = path.toLocaleLowerCase();
      return !lower.startsWith("files/") && !lower.includes("/files/") && lower.endsWith(".json");
    });
  if (!manifestEntry) throw new Error(`The ZIP does not contain ${manifestFilename}.`);
  return hydratePortableManifest(entries, manifestEntry);
}

export function readPortableBundleParts(bytes: Uint8Array, manifestFilename: string) {
  const entries = readPortableEntries(bytes);
  const wanted = normalizeArchivePath(manifestFilename).split("/").pop()!.toLocaleLowerCase();
  return entries
    .filter(([path]) => path.split("/").pop()?.toLocaleLowerCase() === wanted)
    .map((entry) => ({ manifestPath: entry[0], manifest: hydratePortableManifest(entries, entry) }));
}

export function isZipFile(file: { name?: string; type?: string }) {
  return file.type === "application/zip" || file.name?.toLocaleLowerCase().endsWith(".zip") === true;
}
