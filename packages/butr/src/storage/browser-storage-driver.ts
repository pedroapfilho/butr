import type { StorageDriver } from "./persistence";

type BrowserStorageDrivers = {
  /** Survives app restart (localStorage on web, AsyncStorage/MMKV on RN). */
  persistent: StorageDriver;
  /** Cleared when the app session ends (sessionStorage on web, in-memory on RN). */
  session: StorageDriver;
};

type WebStorageKind = "localStorage" | "sessionStorage";

const hasWebStorage = (kind: WebStorageKind): boolean => {
  try {
    return (
      typeof globalThis !== "undefined" &&
      (globalThis as Record<string, unknown>)[kind] !== undefined
    );
  } catch {
    return false;
  }
};

const createMemoryStorageDriver = (): StorageDriver => {
  const memory = new Map<string, string>();
  return {
    getItem(key) {
      return memory.get(key) ?? null;
    },
    removeItem(key) {
      memory.delete(key);
    },
    setItem(key, value) {
      memory.set(key, value);
    },
  };
};

const createWebStorageDriver = (kind: WebStorageKind): StorageDriver => {
  if (!hasWebStorage(kind)) {
    return createMemoryStorageDriver();
  }

  const storage = (globalThis as unknown as Record<WebStorageKind, Storage>)[kind];

  return {
    getItem(key) {
      try {
        return storage.getItem(key);
      } catch {
        return null;
      }
    },
    removeItem(key) {
      try {
        storage.removeItem(key);
      } catch {
        // ignore
      }
    },
    setItem(key, value) {
      try {
        storage.setItem(key, value);
      } catch {
        // ignore quota/security errors
      }
    },
  };
};

/**
 * Default storage drivers for web. `persistent` wraps `localStorage`,
 * `session` wraps `sessionStorage`. Both fall back to in-memory maps
 * when the global isn't available (SSR, non-browser environments).
 */
const createBrowserStorageDriver = (): BrowserStorageDrivers => ({
  persistent: createWebStorageDriver("localStorage"),
  session: createWebStorageDriver("sessionStorage"),
});

export type { BrowserStorageDrivers };
export { createBrowserStorageDriver, createMemoryStorageDriver };
