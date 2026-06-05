export type JsonStorageLike = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export function getBrowserLocalStorage(): JsonStorageLike | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  return window.localStorage;
}

export function readJsonState<T>(
  key: string,
  fallback: T,
  parse: (value: unknown) => T,
  storage: JsonStorageLike | undefined = getBrowserLocalStorage(),
): T {
  if (!storage) {
    return fallback;
  }

  const raw = storage.getItem(key);
  if (!raw) {
    return fallback;
  }

  try {
    return parse(JSON.parse(raw));
  } catch {
    storage.removeItem(key);
    return fallback;
  }
}

export function writeJsonState(
  key: string,
  value: unknown,
  storage: JsonStorageLike | undefined = getBrowserLocalStorage(),
) {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage quota or private-mode failures should never break the operator UI.
  }
}
