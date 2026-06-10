/**
 * Baseline security headers for every API response. SMB-grade hardening
 * against opportunistic scanners: no MIME sniffing, no framing (clickjacking),
 * no referrer leakage, and no caching of API payloads (which can carry
 * approval/provider state).
 */
export function createSecurityHeaders(): Record<string, string> {
  return {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "cache-control": "no-store",
  };
}
