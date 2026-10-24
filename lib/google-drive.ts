export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const DEFAULT_GOOGLE_DRIVE_FOLDER = "Magic Conch";

export type GoogleDriveFileAsset = { name: string; type: string; data: string; size: number };
export type GoogleDriveCollision = "overwrite" | "timestamp" | "increment";
export type GoogleDriveLoadMode = "latest" | "all" | "exact" | "folder";

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
};

type StoredDriveRecord = {
  key: string;
  value: string;
  files: Array<{ id: string; name: string; type: string; size: number }>;
  savedAt: string;
};

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";

export function safeDriveFilename(value: string, fallback = "workflow-result") {
  return value.trim().replace(/[^a-zA-Z0-9-_]/g, "-") || fallback;
}

export function normalizeDriveExtension(value?: string) {
  return value?.trim().replace(/^\.+/, "").toLowerCase() || "json";
}

export function driveRecordFilename(key: string, extension?: string) {
  return `${safeDriveFilename(key)}.${normalizeDriveExtension(extension)}`;
}

export function isDriveRecordMatch(name: string, filename: string, exact: boolean) {
  if (name === filename) return true;
  if (exact) return false;
  const dot = filename.lastIndexOf(".");
  const stem = dot < 0 ? filename : filename.slice(0, dot);
  const extension = dot < 0 ? "" : filename.slice(dot);
  return name.startsWith(`${stem}-`) && name.endsWith(extension);
}

export function splitDriveFolderPath(path: string) {
  return path.split(/[\\/]+/).map((part) => part.trim()).filter((part) => part && part !== "." && part !== "..");
}

function escapeDriveQuery(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function driveFetch(token: string, url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  if (response.ok) return response;
  let detail = "";
  try {
    const body = await response.json() as { error?: { message?: string } };
    detail = body.error?.message || "";
  } catch { /* Preserve the status fallback. */ }
  if (response.status === 401) throw new Error("Google Drive access expired. Reconnect Google Drive in Settings and run the workflow again.");
  throw new Error(detail || `Google Drive request failed (${response.status}).`);
}

async function listDriveFiles(token: string, query: string, orderBy?: string) {
  const files: DriveFile[] = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({
      q: query,
      spaces: "drive",
      pageSize: "1000",
      fields: "nextPageToken,files(id,name,mimeType,modifiedTime,size)",
    });
    if (orderBy) params.set("orderBy", orderBy);
    if (pageToken) params.set("pageToken", pageToken);
    const response = await driveFetch(token, `${DRIVE_API}/files?${params}`);
    const page = await response.json() as { files?: DriveFile[]; nextPageToken?: string };
    files.push(...(page.files || []));
    pageToken = page.nextPageToken || "";
  } while (pageToken);
  return files;
}

async function createDriveFolder(token: string, name: string, parentId: string) {
  const response = await driveFetch(token, `${DRIVE_API}/files?fields=id,name,mimeType`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId], appProperties: { magicConch: "folder" } }),
  });
  return response.json() as Promise<DriveFile>;
}

export async function ensureGoogleDriveFolder(token: string, path = DEFAULT_GOOGLE_DRIVE_FOLDER, createMissing = true) {
  let parentId = "root";
  for (const name of splitDriveFolderPath(path)) {
    const query = `'${escapeDriveQuery(parentId)}' in parents and name = '${escapeDriveQuery(name)}' and mimeType = '${FOLDER_MIME}' and trashed = false`;
    const existing = (await listDriveFiles(token, query))[0];
    if (!existing && !createMissing) return null;
    parentId = existing?.id || (await createDriveFolder(token, name, parentId)).id;
  }
  return parentId;
}

function dataUrlBlob(asset: GoogleDriveFileAsset) {
  const comma = asset.data.indexOf(",");
  if (!asset.data.startsWith("data:") || comma < 0) return new Blob([asset.data], { type: asset.type || "application/octet-stream" });
  const header = asset.data.slice(0, comma);
  const body = asset.data.slice(comma + 1);
  if (!header.endsWith(";base64")) return new Blob([decodeURIComponent(body)], { type: asset.type || header.slice(5) || "application/octet-stream" });
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: asset.type || header.slice(5, -7) || "application/octet-stream" });
}

async function blobDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Could not read a Google Drive file."));
    reader.readAsDataURL(blob);
  });
}

async function uploadDriveBlob(
  token: string,
  parentId: string,
  name: string,
  blob: Blob,
  properties: Record<string, string>,
  existingId?: string,
) {
  const boundary = `magic_conch_${crypto.randomUUID().replace(/-/g, "")}`;
  const metadata = { name, parents: existingId ? undefined : [parentId], appProperties: properties };
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: ${blob.type || "application/octet-stream"}\r\n\r\n`,
    blob,
    `\r\n--${boundary}--`,
  ]);
  const target = existingId ? `${DRIVE_UPLOAD_API}/files/${encodeURIComponent(existingId)}` : `${DRIVE_UPLOAD_API}/files`;
  const response = await driveFetch(token, `${target}?uploadType=multipart&fields=id,name,mimeType,modifiedTime,size`, {
    method: existingId ? "PATCH" : "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  return response.json() as Promise<DriveFile>;
}

async function collisionTarget(token: string, parentId: string, requestedName: string, collision: GoogleDriveCollision) {
  const query = `'${escapeDriveQuery(parentId)}' in parents and trashed = false`;
  const names = await listDriveFiles(token, query);
  const exact = names.find((file) => file.name === requestedName);
  if (!exact) return { name: requestedName };
  if (collision === "overwrite") return { name: requestedName, existingId: exact.id };
  const dot = requestedName.lastIndexOf(".");
  const stem = dot < 0 ? requestedName : requestedName.slice(0, dot);
  const extension = dot < 0 ? "" : requestedName.slice(dot);
  if (collision === "timestamp") {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return { name: `${stem}-${stamp}${extension}` };
  }
  const used = new Set(names.map((file) => file.name));
  let index = 2;
  while (used.has(`${stem}-${index}${extension}`)) index += 1;
  return { name: `${stem}-${index}${extension}` };
}

export async function saveGoogleDriveRecord(options: {
  token: string;
  folderPath?: string;
  subfolder?: string;
  key?: string;
  fileExtension?: string;
  collision?: GoogleDriveCollision;
  saveFiles?: "data" | "files" | "both";
  value: string;
  files: GoogleDriveFileAsset[];
}) {
  const folderPath = [options.folderPath || DEFAULT_GOOGLE_DRIVE_FOLDER, options.subfolder || ""].filter(Boolean).join("/");
  const parentId = await ensureGoogleDriveFolder(options.token, folderPath);
  if (!parentId) throw new Error("The Google Drive folder could not be created.");
  const collision = options.collision || "increment";
  const savedFiles: StoredDriveRecord["files"] = [];
  if (options.saveFiles !== "data") {
    for (const asset of options.files) {
      const target = await collisionTarget(options.token, parentId, asset.name, collision);
      const uploaded = await uploadDriveBlob(options.token, parentId, target.name, dataUrlBlob(asset), { magicConch: "asset" }, target.existingId);
      savedFiles.push({ id: uploaded.id, name: uploaded.name, type: asset.type, size: asset.size });
    }
  }
  const record: StoredDriveRecord = {
    key: safeDriveFilename(options.key || "workflow-result"),
    value: options.value,
    files: savedFiles,
    savedAt: new Date().toISOString(),
  };
  if (options.saveFiles !== "files") {
    const target = await collisionTarget(options.token, parentId, driveRecordFilename(record.key, options.fileExtension), collision);
    await uploadDriveBlob(options.token, parentId, target.name, new Blob([JSON.stringify(record, null, 2)], { type: "application/json" }), { magicConch: "record", magicConchKey: record.key }, target.existingId);
  }
  return { record, folderPath };
}

async function downloadDriveAsset(token: string, file: { id: string; name: string; type?: string; size?: number }) {
  const response = await driveFetch(token, `${DRIVE_API}/files/${encodeURIComponent(file.id)}?alt=media`);
  const blob = await response.blob();
  return {
    name: file.name,
    type: file.type || blob.type || "application/octet-stream",
    size: file.size ?? blob.size,
    data: await blobDataUrl(blob),
  } satisfies GoogleDriveFileAsset;
}

export async function loadGoogleDriveRecord(options: {
  token: string;
  folderPath?: string;
  subfolder?: string;
  key?: string;
  fileExtension?: string;
  loadMode?: GoogleDriveLoadMode;
  recursive?: boolean;
}) {
  const folderPath = [options.folderPath || DEFAULT_GOOGLE_DRIVE_FOLDER, options.subfolder || ""].filter(Boolean).join("/");
  const parentId = await ensureGoogleDriveFolder(options.token, folderPath, false);
  if (!parentId) return { value: "The configured Google Drive folder was not found.", files: [], source: `Google Drive / ${folderPath}` };
  const mode = options.loadMode || "latest";
  if (mode === "folder") {
    const assets: GoogleDriveFileAsset[] = [];
    const visit = async (folderId: string, prefix = "") => {
      const entries = await listDriveFiles(options.token, `'${escapeDriveQuery(folderId)}' in parents and trashed = false`, "name_natural");
      for (const entry of entries) {
        if (entry.mimeType === FOLDER_MIME) {
          if (options.recursive) await visit(entry.id, `${prefix}${entry.name}/`);
        } else {
          const asset = await downloadDriveAsset(options.token, { ...entry, name: `${prefix}${entry.name}`, size: Number(entry.size || 0) });
          assets.push(asset);
        }
      }
    };
    await visit(parentId);
    return { value: assets.map((file) => file.name).join("\n"), files: assets, source: `Google Drive / ${folderPath}` };
  }

  const filename = driveRecordFilename(options.key || "workflow-result", options.fileExtension);
  const entries = await listDriveFiles(options.token, `'${escapeDriveQuery(parentId)}' in parents and trashed = false`, "modifiedTime desc");
  const matches = entries.filter((entry) => isDriveRecordMatch(entry.name, filename, mode === "exact"));
  const selected = mode === "all" ? matches : matches.slice(0, 1);
  if (!selected.length) return { value: "No saved Google Drive record was found.", files: [], source: `Google Drive / ${folderPath}` };
  const values: string[] = [];
  const assets: GoogleDriveFileAsset[] = [];
  for (const file of selected) {
    const response = await driveFetch(options.token, `${DRIVE_API}/files/${encodeURIComponent(file.id)}?alt=media`);
    const text = await response.text();
    let record: Partial<StoredDriveRecord>;
    try { record = JSON.parse(text) as Partial<StoredDriveRecord>; } catch { record = { value: text }; }
    values.push(String(record.value ?? text));
    for (const asset of record.files || []) assets.push(await downloadDriveAsset(options.token, asset));
  }
  const unique = assets.filter((asset, index) => assets.findIndex((candidate) => candidate.name === asset.name && candidate.data === asset.data) === index);
  return { value: values.join("\n\n"), files: unique, source: `Google Drive / ${folderPath}` };
}

type GoogleTokenResponse = { access_token?: string; expires_in?: number; error?: string; error_description?: string };
type GoogleTokenClient = { requestAccessToken: (options?: { prompt?: string }) => void };
type GoogleOAuthError = { message?: string; type?: string };

export function googleOAuthErrorMessage(error: GoogleOAuthError) {
  if (error.type === "popup_failed_to_open") {
    return "Chrome blocked the Google sign-in window. Allow pop-ups and redirects for this site, then try again.";
  }
  if (error.type === "popup_closed") return "The Google sign-in window was closed before access was granted.";
  return error.message || error.type || "Google sign-in could not be opened.";
}

export async function loadGoogleIdentityServices() {
  const googleWindow = window as typeof window & { google?: { accounts?: { oauth2?: unknown } } };
  if (googleWindow.google?.accounts?.oauth2) return;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load Google sign-in.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Google sign-in."));
    document.head.appendChild(script);
  });
}

export function requestGoogleDriveToken(clientId: string) {
  if (!clientId.trim()) return Promise.reject(new Error("Enter a Google OAuth client ID in Settings first."));
  return new Promise<{ accessToken: string; expiresAt: number }>((resolve, reject) => {
    const googleWindow = window as typeof window & {
      google?: { accounts?: { oauth2?: { initTokenClient: (config: Record<string, unknown>) => GoogleTokenClient } } };
    };
    const oauth2 = googleWindow.google?.accounts?.oauth2;
    if (!oauth2) return reject(new Error("Google sign-in is still loading. Try again in a moment."));
    const client = oauth2.initTokenClient({
      client_id: clientId.trim(),
      scope: GOOGLE_DRIVE_SCOPE,
      callback: (response: GoogleTokenResponse) => {
        if (!response.access_token) return reject(new Error(response.error_description || response.error || "Google Drive access was not granted."));
        resolve({ accessToken: response.access_token, expiresAt: Date.now() + Math.max(30, Number(response.expires_in || 3600) - 30) * 1000 });
      },
      error_callback: (error: GoogleOAuthError) => reject(new Error(googleOAuthErrorMessage(error))),
    });
    client.requestAccessToken({ prompt: "consent" });
  });
}

export function revokeGoogleDriveToken(accessToken: string) {
  const googleWindow = window as typeof window & { google?: { accounts?: { oauth2?: { revoke: (token: string, callback: () => void) => void } } } };
  return new Promise<void>((resolve) => {
    const revoke = googleWindow.google?.accounts?.oauth2?.revoke;
    if (!revoke || !accessToken) return resolve();
    revoke(accessToken, resolve);
  });
}
