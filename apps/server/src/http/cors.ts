const DEFAULT_ALLOWED_ORIGINS: ReadonlyArray<string> = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "https://orchestrator.endruin.com",
];

const ALLOWED_METHODS = "GET, HEAD, OPTIONS, POST";

export function resolveAllowedOrigins(): Set<string> {
  const extras = (process.env.ORCHESTRATOR_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set<string>([...DEFAULT_ALLOWED_ORIGINS, ...extras]);
}

export function pickAllowedOrigin(originHeader: string | undefined, allowed: Set<string> = resolveAllowedOrigins()): string | undefined {
  if (!originHeader) {
    return allowed.values().next().value;
  }

  return allowed.has(originHeader) ? originHeader : undefined;
}

export function createCorsHeaders(originHeader?: string, allowed: Set<string> = resolveAllowedOrigins()) {
  const allowedOrigin = pickAllowedOrigin(originHeader, allowed);
  return {
    "access-control-allow-headers": "content-type,authorization",
    "access-control-allow-methods": ALLOWED_METHODS,
    ...(allowedOrigin
      ? {
          "access-control-allow-origin": allowedOrigin,
          "access-control-allow-credentials": "true",
          "access-control-allow-private-network": "true",
        }
      : {}),
    "access-control-max-age": "600",
    "vary": "Origin, Access-Control-Request-Method, Access-Control-Request-Headers, Access-Control-Request-Private-Network",
  };
}
