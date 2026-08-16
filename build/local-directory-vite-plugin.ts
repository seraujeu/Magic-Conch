import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

export const LOCAL_DIRECTORY_ENDPOINT = "/_magic-conch/local-directory";
export const DEFAULT_LOCAL_DIRECTORY = "user-data";

type CollisionMode = "increment" | "timestamp" | "overwrite";
type FileAsset = { name: string; type: string; data: string; size: number };
type StoredRecord = { key: string; value: string; files: string[]; savedAt: string };

export type LocalDirectoryRequest = {
  directory?: string;
  operation?: "save-record" | "load-record" | "list-files";
  subfolder?: string[];
  key?: string;
  value?: string;
  files?: FileAsset[];
  saveFiles?: "both" | "data" | "files";
  collision?: CollisionMode;
  loadMode?: "latest" | "all" | "exact";
  recursive?: boolean;
};

const MIME_TYPES: Record<string, string> = {
  ".aac": "audio/aac", ".avif": "image/avif", ".bmp": "image/bmp", ".csv": "text/csv",
  ".flac": "audio/flac", ".gif": "image/gif", ".htm": "text/html", ".html": "text/html",
  ".jpeg": "image/jpeg", ".jpg": "image/jpeg", ".json": "application/json", ".m4a": "audio/mp4",
  ".md": "text/markdown", ".mkv": "video/x-matroska", ".mov": "video/quicktime", ".mp3": "audio/mpeg",
  ".mp4": "video/mp4", ".ogg": "audio/ogg", ".pdf": "application/pdf", ".png": "image/png",
  ".svg": "image/svg+xml", ".txt": "text/plain", ".wav": "audio/wav", ".webm": "video/webm",
  ".webp": "image/webp", ".xml": "application/xml", ".zip": "application/zip",
};

function cleanDirectorySetting(directory?: string) {
  const trimmed = directory?.trim();
  return trimmed || DEFAULT_LOCAL_DIRECTORY;
}

export function resolveConfiguredDirectory(projectRoot: string, directory?: string) {
  const configured = cleanDirectorySetting(directory);
  return isAbsolute(configured) ? resolve(configured) : resolve(projectRoot, configured);
}

function validateSubfolder(segments: unknown): string[] {
  if (segments == null) return [];
  if (!Array.isArray(segments) || segments.some((segment) => (
    typeof segment !== "string"
    || !segment
    || segment === "."
    || segment === ".."
    || segment.includes("/")
    || segment.includes("\\")
  ))) throw new Error("The subfolder path is invalid.");
  return segments;
}

function resolveSubfolder(root: string, segments: unknown) {
  const folder = resolve(root, ...validateSubfolder(segments));
  const fromRoot = relative(root, folder);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) throw new Error("The subfolder must stay inside the configured directory.");
  return folder;
}

function safeFilename(name: unknown) {
  if (typeof name !== "string" || !name || name === "." || name === ".." || name.includes("/") || name.includes("\\")) {
    throw new Error("The file name is invalid.");
  }
  return name;
}

async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function collisionSafePath(folder: string, filename: string, collision: CollisionMode = "increment") {
  const original = safeFilename(filename);
  const direct = resolve(folder, original);
  if (collision === "overwrite" || !(await exists(direct))) return direct;
  const extension = extname(original);
  const stem = extension ? original.slice(0, -extension.length) : original;
  if (collision === "timestamp") {
    return resolve(folder, `${stem}-${new Date().toISOString().replace(/[:.]/g, "-")}${extension}`);
  }
  let index = 2;
  while (await exists(resolve(folder, `${stem}-${index}${extension}`))) index += 1;
  return resolve(folder, `${stem}-${index}${extension}`);
}

function decodeAsset(asset: FileAsset) {
  if (!asset || typeof asset.data !== "string") throw new Error("The file data is invalid.");
  const match = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(asset.data);
  if (!match) throw new Error(`The file “${asset.name || "unnamed"}” is not a data URL.`);
  return match[2]
    ? Buffer.from(match[3], "base64")
    : Buffer.from(decodeURIComponent(match[3]), "utf8");
}

async function fileAsset(path: string, name: string): Promise<FileAsset> {
  const data = await readFile(path);
  const type = MIME_TYPES[extname(name).toLowerCase()] || "application/octet-stream";
  return { name, type, data: `data:${type};base64,${data.toString("base64")}`, size: data.byteLength };
}

async function saveRecord(projectRoot: string, request: LocalDirectoryRequest) {
  const root = resolveConfiguredDirectory(projectRoot, request.directory);
  const folder = resolveSubfolder(root, request.subfolder);
  await mkdir(folder, { recursive: true });
  const key = safeFilename(request.key || "workflow-result");
  const collision = request.collision || "increment";
  const savedFiles: string[] = [];
  if (request.saveFiles !== "data") {
    for (const asset of request.files || []) {
      const path = await collisionSafePath(folder, asset.name, collision);
      await writeFile(path, decodeAsset(asset));
      savedFiles.push(relative(folder, path).replace(/\\/g, "/"));
    }
  }
  const record: StoredRecord = {
    key,
    value: String(request.value ?? ""),
    files: savedFiles,
    savedAt: new Date().toISOString(),
  };
  if (request.saveFiles !== "files") {
    const path = await collisionSafePath(folder, `${key}.json`, collision);
    await writeFile(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  }
  return { record, directory: root };
}

async function readStoredAsset(folder: string, filename: string) {
  try {
    const safeName = safeFilename(filename);
    return await fileAsset(resolve(folder, safeName), safeName);
  } catch {
    return null;
  }
}

async function loadRecord(projectRoot: string, request: LocalDirectoryRequest) {
  const root = resolveConfiguredDirectory(projectRoot, request.directory);
  const folder = resolveSubfolder(root, request.subfolder);
  const key = safeFilename(request.key || "workflow-result");
  let entries;
  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { found: false, reason: "folder" };
    throw error;
  }
  const names = entries.filter((entry) => entry.isFile()).map((entry) => entry.name).filter((name) => {
    const exact = name === `${key}.json`;
    const versioned = name.startsWith(`${key}-`) && name.endsWith(".json");
    return request.loadMode === "exact" ? exact : exact || versioned;
  });
  const matches = await Promise.all(names.map(async (name) => ({ name, modified: (await stat(resolve(folder, name))).mtimeMs })));
  matches.sort((a, b) => b.modified - a.modified);
  const selected = request.loadMode === "all" ? matches : matches.slice(0, 1);
  if (!selected.length) return { found: false, reason: "record" };
  const values: string[] = [];
  const assets: FileAsset[] = [];
  for (const match of selected) {
    const text = await readFile(resolve(folder, match.name), "utf8");
    let record: Partial<StoredRecord>;
    try { record = JSON.parse(text) as Partial<StoredRecord>; }
    catch { record = { value: text }; }
    values.push(String(record.value ?? text));
    for (const filename of record.files || []) {
      const asset = await readStoredAsset(folder, filename);
      if (asset) assets.push(asset);
    }
  }
  const uniqueAssets = assets.filter((asset, index) => assets.findIndex((candidate) => (
    candidate.name === asset.name && candidate.data === asset.data
  )) === index);
  return { found: true, value: values.join("\n\n"), files: uniqueAssets, directory: root };
}

async function listFiles(projectRoot: string, request: LocalDirectoryRequest) {
  const root = resolveConfiguredDirectory(projectRoot, request.directory);
  const folder = resolveSubfolder(root, request.subfolder);
  const assets: FileAsset[] = [];
  const visit = async (current: string, prefix = "") => {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const relativeName = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (request.recursive) await visit(resolve(current, entry.name), relativeName);
      } else if (entry.isFile()) {
        assets.push(await fileAsset(resolve(current, entry.name), relativeName));
      }
    }
  };
  await visit(folder);
  return { files: assets, directory: root };
}

async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > 256 * 1024 * 1024) throw new Error("The local file request is too large.");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as LocalDirectoryRequest;
}

function sendJson(response: ServerResponse, status: number, value: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(value));
}

export async function handleLocalDirectoryRequest(projectRoot: string, request: LocalDirectoryRequest) {
  if (request.operation === "save-record") return saveRecord(projectRoot, request);
  if (request.operation === "load-record") return loadRecord(projectRoot, request);
  if (request.operation === "list-files") return listFiles(projectRoot, request);
  throw new Error("Unknown local directory operation.");
}

export function localDirectory(): Plugin {
  let projectRoot = process.cwd();
  const middleware = (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const pathname = new URL(request.url || "/", "http://localhost").pathname;
    if (pathname !== LOCAL_DIRECTORY_ENDPOINT) return next();
    if (request.method !== "POST") {
      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }
    void readJsonBody(request)
      .then((body) => handleLocalDirectoryRequest(projectRoot, body))
      .then((result) => sendJson(response, 200, result))
      .catch((error: unknown) => sendJson(response, 400, {
        error: error instanceof Error ? error.message : "The local directory request failed.",
      }));
  };

  return {
    name: "magic-conch-local-directory",
    configResolved(config) { projectRoot = config.root; },
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}
