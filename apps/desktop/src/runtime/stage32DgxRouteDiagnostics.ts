import { createDgxOrchestratorJsonHeaders } from "./stage31DgxAuth";
import { resolveDgxServerBaseUrls } from "./stage30DgxEndpoints";

export type Stage32DgxRouteCheckStatus = "ok" | "http_error" | "network_error" | "timeout" | "crypto_error";

export type Stage32DgxRouteProbe = {
  endpoint: string;
  method: "GET" | "OPTIONS";
  status: Stage32DgxRouteCheckStatus;
  latencyMs: number;
  httpStatus?: number;
  error?: string;
  bodyPreview?: string;
};

export type Stage32DgxRouteDiagnostic = {
  baseUrl: string;
  health: Stage32DgxRouteProbe;
  providerPreflight: Stage32DgxRouteProbe;
};

export type Stage32DgxRouteDiagnosticSnapshot = {
  checkedAt: string;
  routes: Stage32DgxRouteDiagnostic[];
  summary: {
    ok: number;
    httpError: number;
    networkError: number;
    timeout: number;
    cryptoError: number;
  };
};

export type Stage32DgxRouteDiagnosticInput = {
  fetchImpl?: typeof fetch;
  serverBaseUrl?: string | string[];
  timeoutMs?: number;
  checkedAt?: string;
};

export async function probeDgxProviderRoutes({
  fetchImpl = fetch,
  serverBaseUrl,
  timeoutMs = 1_500,
  checkedAt = new Date().toISOString(),
}: Stage32DgxRouteDiagnosticInput = {}): Promise<Stage32DgxRouteDiagnosticSnapshot> {
  const routes: Stage32DgxRouteDiagnostic[] = [];

  for (const baseUrl of resolveDgxServerBaseUrls(serverBaseUrl)) {
    const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
    const healthEndpoint = `${normalizedBaseUrl}/health`;
    const providerEndpoint = `${normalizedBaseUrl}/provider-completions`;
    const [health, providerPreflight] = await Promise.all([
      probeRoute(fetchImpl, healthEndpoint, "GET", timeoutMs),
      probeRoute(fetchImpl, providerEndpoint, "OPTIONS", timeoutMs),
    ]);

    routes.push({
      baseUrl: normalizedBaseUrl,
      health,
      providerPreflight,
    });
  }

  return {
    checkedAt,
    routes,
    summary: summarizeRouteDiagnostics(routes),
  };
}

function summarizeRouteDiagnostics(routes: Stage32DgxRouteDiagnostic[]) {
  const probes = routes.flatMap((route) => [route.health, route.providerPreflight]);
  return {
    ok: probes.filter((probe) => probe.status === "ok").length,
    httpError: probes.filter((probe) => probe.status === "http_error").length,
    networkError: probes.filter((probe) => probe.status === "network_error").length,
    timeout: probes.filter((probe) => probe.status === "timeout").length,
    cryptoError: probes.filter((probe) => probe.status === "crypto_error").length,
  };
}

async function probeRoute(fetchImpl: typeof fetch, endpoint: string, method: "GET" | "OPTIONS", timeoutMs: number) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const parsedPath = new URL(endpoint, "http://localhost").pathname;
    const response = await fetchImpl(endpoint, {
      headers: await createDgxOrchestratorJsonHeaders(method, parsedPath, endpoint),
      method,
      signal: controller.signal,
    });
    const rawText = await readResponsePreview(response);
    return {
      endpoint,
      method,
      status: response.ok ? "ok" : "http_error",
      latencyMs: Date.now() - startedAt,
      httpStatus: response.status,
      bodyPreview: redactDgxDiagnosticPreview(rawText).slice(0, 180),
    } satisfies Stage32DgxRouteProbe;
  } catch (error) {
    return {
      endpoint,
      method,
      status: isAbortError(error) ? "timeout" : isDgxAuthCryptoError(error) ? "crypto_error" : "network_error",
      latencyMs: Date.now() - startedAt,
      error: redactDgxDiagnosticPreview(formatRouteError(error)),
    } satisfies Stage32DgxRouteProbe;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

async function readResponsePreview(response: Response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

function isDgxAuthCryptoError(error: unknown) {
  return error instanceof Error && error.name === "DgxAuthCryptoError";
}

function formatRouteError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function redactDgxDiagnosticPreview(value: string) {
  return value
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[redacted-secret]")
    .replace(/\b(?:api[_-]?key|token|secret|authorization|bearer)\b[^\s"',;]*/gi, "[redacted-secret]")
    .replace(/(?:\/Users|\/home)\/[^\s"',;]+/g, "[redacted-path]");
}
