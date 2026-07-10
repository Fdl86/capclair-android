export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson<T>(key: string, value: T): boolean {
  try {
    const serialized = JSON.stringify(value);
    window.localStorage.setItem(key, serialized);
    return window.localStorage.getItem(key) === serialized;
  } catch {
    return false;
  }
}

export function removeExpiredLocalStorageEntries(prefix: string, ttlMs: number): number {
  let removed = 0;
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as { savedAt?: number };
        if (typeof parsed.savedAt !== 'number' || Date.now() - parsed.savedAt > ttlMs) {
          window.localStorage.removeItem(key);
          removed += 1;
        }
      } catch {
        window.localStorage.removeItem(key);
        removed += 1;
      }
    }
  } catch {
    // Best effort only.
  }
  return removed;
}
