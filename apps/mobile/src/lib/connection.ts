/**
 * Mobile connection settings live in localStorage so the same SOULs / chats
 * keep working when the user re-opens the PWA. Defaults match the
 * `VITE_ORCHESTRATOR_*` and DGX URLs the server expects.
 */

const STORAGE_KEY = "mobile.settings.connection";

export type ConnectionSettings = {
  baseUrlPrimary: string;
  baseUrlFallback: string;
  apiToken: string;
};

const DEFAULT_PRIMARY = "https://orchestrator.endruin.com";
const DEFAULT_FALLBACK = "http://dgx-02:4317";

export function loadConnectionSettings(): ConnectionSettings {
  const fallback: ConnectionSettings = {
    baseUrlPrimary:
      (typeof import.meta !== "undefined" && (import.meta as { env?: Record<string, string> }).env?.VITE_DGX_SERVER_BASE_URL) ||
      DEFAULT_PRIMARY,
    baseUrlFallback:
      (typeof import.meta !== "undefined" && (import.meta as { env?: Record<string, string> }).env?.VITE_DGX_SERVER_LAN_BASE_URL) ||
      DEFAULT_FALLBACK,
    apiToken:
      (typeof import.meta !== "undefined" && (import.meta as { env?: Record<string, string> }).env?.VITE_ORCHESTRATOR_API_TOKEN) ||
      "",
  };
  if (typeof localStorage === "undefined") return fallback;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<ConnectionSettings>;
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

export function saveConnectionSettings(value: ConnectionSettings): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch (err) {
    console.warn("[mobile] failed to persist connection settings", err);
  }
}

export function resetConnectionSettings(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
