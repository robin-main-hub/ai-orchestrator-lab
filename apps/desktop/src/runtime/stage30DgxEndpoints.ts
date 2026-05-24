export const ENDRUIN_ORCHESTRATOR_BASE_URL = "https://orchestrator.endruin.com";
export const DGX02_LAN_ORCHESTRATOR_BASE_URL = "http://dgx-02:4317";

export const DEFAULT_DGX_SERVER_BASE_URL = DGX02_LAN_ORCHESTRATOR_BASE_URL;
export const DEFAULT_DGX_SERVER_FALLBACK_BASE_URLS = [
  DGX02_LAN_ORCHESTRATOR_BASE_URL,
  ENDRUIN_ORCHESTRATOR_BASE_URL,
] as const;

export function resolveDgxServerBaseUrls(baseUrl?: string | string[]) {
  const candidates = Array.isArray(baseUrl)
    ? baseUrl
    : typeof baseUrl === "string" && baseUrl.trim()
      ? [baseUrl]
      : [...DEFAULT_DGX_SERVER_FALLBACK_BASE_URLS];

  return Array.from(new Set(candidates.map((candidate) => normalizeDgxServerBaseUrl(candidate)).filter(Boolean)));
}

export function normalizeDgxServerBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/$/, "");
}
