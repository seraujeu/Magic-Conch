export type ArtifactStorageKey = "workflows" | "plugins";

const ARTIFACT_DATABASE = "magic-conch-artifact-storage";
const ARTIFACT_STORE = "artifacts";

function openArtifactDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(ARTIFACT_DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(ARTIFACT_STORE)) {
        request.result.createObjectStore(ARTIFACT_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readStoredArtifact<T>(key: ArtifactStorageKey) {
  if (typeof indexedDB === "undefined") return null;
  const database = await openArtifactDatabase();
  const value = await new Promise<T | null>((resolve, reject) => {
    const transaction = database.transaction(ARTIFACT_STORE, "readonly");
    const request = transaction.objectStore(ARTIFACT_STORE).get(key);
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return value;
}

const writeQueues = new Map<ArtifactStorageKey, Promise<void>>();

async function writeStoredArtifactNow<T>(key: ArtifactStorageKey, value: T) {
  if (typeof indexedDB === "undefined") throw new Error("IndexedDB is unavailable.");
  const database = await openArtifactDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(ARTIFACT_STORE, "readwrite");
    transaction.objectStore(ARTIFACT_STORE).put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export function writeStoredArtifact<T>(key: ArtifactStorageKey, value: T) {
  const previous = writeQueues.get(key) || Promise.resolve();
  const operation = previous
    .catch(() => { /* A failed older write must not block newer state. */ })
    .then(() => writeStoredArtifactNow(key, value));
  writeQueues.set(key, operation.catch(() => { /* The caller handles this failure. */ }));
  return operation;
}

/** Retains manifests and metadata while omitting large embedded file bodies. */
export function artifactFallbackJson(value: unknown) {
  return JSON.stringify(value, (key, item) =>
    key === "data" && typeof item === "string" && item.startsWith("data:") ? "" : item,
  );
}
