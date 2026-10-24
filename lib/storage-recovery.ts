export type StoredArrayRecovery<T> = {
  value: T[] | null;
  usedFallback: boolean;
};

/** A fallback is written only after a failed save and cleared after a committed save. */
export function recoverStoredArray<T>(indexedValue: T[] | null, fallbackJson: string | null): StoredArrayRecovery<T> {
  if (fallbackJson !== null) {
    try {
      const fallback: unknown = JSON.parse(fallbackJson);
      if (Array.isArray(fallback)) return { value: fallback as T[], usedFallback: true };
    } catch {
      // A damaged fallback must not prevent restoring the last committed state.
    }
  }
  return { value: Array.isArray(indexedValue) ? indexedValue : null, usedFallback: false };
}
