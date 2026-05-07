import { vi } from "vitest";

const createMockStorage = (): Storage => {
  const store = new Map<string, string>();
  return {
    clear: vi.fn(() => {
      store.clear();
    }),
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    key: vi.fn((index: number) => {
      const keys = Array.from(store.keys());
      return keys[index] ?? null;
    }),
    get length() {
      return store.size;
    },
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
  };
};

if (globalThis.window === undefined) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: createMockStorage(),
      sessionStorage: createMockStorage(),
    },
    writable: true,
  });
}

if (globalThis.sessionStorage === undefined) {
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: (globalThis.window as { sessionStorage: Storage }).sessionStorage,
    writable: true,
  });
}

if (globalThis.localStorage === undefined) {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: (globalThis.window as { localStorage: Storage }).localStorage,
    writable: true,
  });
}
