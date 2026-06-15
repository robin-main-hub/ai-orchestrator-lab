function hasStorageApi(value: unknown): value is Storage {
  return Boolean(
    value &&
      typeof (value as Storage).getItem === "function" &&
      typeof (value as Storage).setItem === "function" &&
      typeof (value as Storage).removeItem === "function" &&
      typeof (value as Storage).clear === "function",
  );
}

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(String(key)) ?? null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(String(key));
    },
    setItem(key: string, value: string) {
      values.set(String(key), String(value));
    },
  };
}

function bindStorageGlobal(name: "localStorage" | "sessionStorage") {
  if (typeof window === "undefined") return;
  const existing = window[name];
  const storage = hasStorageApi(existing) ? existing : createMemoryStorage();
  Object.defineProperty(window, name, {
    configurable: true,
    enumerable: true,
    value: storage,
    writable: true,
  });
  Object.defineProperty(globalThis, name, {
    configurable: true,
    enumerable: true,
    value: storage,
    writable: true,
  });
}

bindStorageGlobal("localStorage");
bindStorageGlobal("sessionStorage");
