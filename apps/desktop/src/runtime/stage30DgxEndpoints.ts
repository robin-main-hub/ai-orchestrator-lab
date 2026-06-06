export const ENDRUIN_ORCHESTRATOR_BASE_URL = "https://orchestrator.endruin.com";
export const DGX02_LAN_ORCHESTRATOR_BASE_URL = "http://dgx-02:4317";

export const DEFAULT_DGX_SERVER_BASE_URL = DGX02_LAN_ORCHESTRATOR_BASE_URL;
export const DEFAULT_DGX_SERVER_FALLBACK_BASE_URLS = [
  DGX02_LAN_ORCHESTRATOR_BASE_URL,
] as const;

type DesktopImportMeta = ImportMeta & {
  env?: {
    VITE_DGX_SERVER_BASE_URL?: string;
    VITE_DGX_SERVER_ENABLE_PUBLIC_FALLBACK?: string;
    VITE_DGX_SERVER_FALLBACK_BASE_URLS?: string;
    VITE_DGX_SERVER_LAN_BASE_URL?: string;
  };
};

export function resolveDgxServerBaseUrls(baseUrl?: string | string[]) {
  const candidates = Array.isArray(baseUrl)
    ? baseUrl
    : typeof baseUrl === "string" && baseUrl.trim()
      ? [baseUrl]
      : resolveConfiguredDgxServerBaseUrls();

  return Array.from(new Set(candidates.map((candidate) => normalizeDgxServerBaseUrl(candidate)).filter(Boolean)));
}

export function normalizeDgxServerBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/$/, "");
}

export function resolveConfiguredDgxServerBaseUrls() {
  const env = (import.meta as DesktopImportMeta).env ?? {};
  const primary = env.VITE_DGX_SERVER_BASE_URL?.trim();
  const lan = env.VITE_DGX_SERVER_LAN_BASE_URL?.trim();
  const fallback = env.VITE_DGX_SERVER_FALLBACK_BASE_URLS?.split(",").map((candidate) => candidate.trim()).filter(Boolean) ?? [];
  const publicFallbackEnabled = env.VITE_DGX_SERVER_ENABLE_PUBLIC_FALLBACK === "true";

  if (primary || lan || fallback.length > 0) {
    const list = [lan, primary, ...fallback].filter((candidate): candidate is string => Boolean(candidate));
    if (!list.includes(DGX02_LAN_ORCHESTRATOR_BASE_URL)) {
      list.push(DGX02_LAN_ORCHESTRATOR_BASE_URL);
    }
    if (publicFallbackEnabled && !list.includes(ENDRUIN_ORCHESTRATOR_BASE_URL)) {
      list.push(ENDRUIN_ORCHESTRATOR_BASE_URL);
    }
    return list;
  }

  return publicFallbackEnabled
    ? [...DEFAULT_DGX_SERVER_FALLBACK_BASE_URLS, ENDRUIN_ORCHESTRATOR_BASE_URL]
    : [...DEFAULT_DGX_SERVER_FALLBACK_BASE_URLS];
}
