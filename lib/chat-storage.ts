const CHAT_DATABASE = "magic-conch-chat-storage";
const CHAT_STORE = "sessions";
const CHAT_SESSIONS_KEY = "all";

function openChatDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(CHAT_DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(CHAT_STORE)) {
        request.result.createObjectStore(CHAT_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readStoredChatSessions<T>() {
  if (typeof indexedDB === "undefined") return null;
  const database = await openChatDatabase();
  const sessions = await new Promise<T | null>((resolve, reject) => {
    const transaction = database.transaction(CHAT_STORE, "readonly");
    const request = transaction.objectStore(CHAT_STORE).get(CHAT_SESSIONS_KEY);
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return sessions;
}

let chatWriteQueue = Promise.resolve();

async function writeStoredChatSessionsNow<T>(sessions: T) {
  if (typeof indexedDB === "undefined") throw new Error("IndexedDB is unavailable.");
  const database = await openChatDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(CHAT_STORE, "readwrite");
    transaction.objectStore(CHAT_STORE).put(sessions, CHAT_SESSIONS_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export function writeStoredChatSessions<T>(sessions: T) {
  const operation = chatWriteQueue
    .catch(() => { /* A failed older save must not block newer chat state. */ })
    .then(() => writeStoredChatSessionsNow(sessions));
  chatWriteQueue = operation.catch(() => { /* The caller handles this save failure. */ });
  return operation;
}

/** A quota-safe fallback that retains chat text while omitting base64 file bodies. */
export function chatSessionsFallbackJson(sessions: unknown) {
  return JSON.stringify(sessions, (key, value) =>
    key === "data" && typeof value === "string" && value.startsWith("data:") ? "" : value,
  );
}
