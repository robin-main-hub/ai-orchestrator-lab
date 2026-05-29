const DEFAULT_ALLOWED_ORIGINS: ReadonlyArray<string> = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "https://orchestrator.endruin.com",
];

const FALLBACK_ALLOWED_ORIGIN = "http://localhost:5173";
const ALLOWED_METHODS = "GET, HEAD, OPTIONS, POST";

export function resolveAllowedOrigins(): Set<string> {
  const extras = (process.env.ORCHESTRATOR_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set<string>([...DEFAULT_ALLOWED_ORIGINS, ...extras]);
}

export function pickAllowedOrigin(originHeader: string | undefined, allowed: Set<string> = resolveAllowedOrigins()): string {
  return originHeader && allowed.has(originHeader) ? originHeader : FALLBACK_ALLOWED_ORIGIN;
}

export function createCorsHeaders(originHeader?: string, allowed: Set<string> = resolveAllowedOrigins()) {
  return {
    "access-control-allow-headers": "content-type,authorization",
    "access-control-allow-methods": ALLOWED_METHODS,
    "access-control-allow-origin": pickAllowedOrigin(originHeader, allowed),
    "access-control-allow-credentials": "true",
    "access-control-allow-private-network": "true",
    "access-control-max-age": "600",
    "vary": "Origin, Access-Control-Request-Method, Access-Control-Request-Headers, Access-Control-Request-Private-Network",
  };
}
