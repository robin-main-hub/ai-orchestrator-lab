import type { RmasRunConfig, RmasRunRecord, RmasRunSummary } from "@ai-orchestrator/protocol";
import { resolveConfiguredDgxServerBaseUrls, resolveDgxServerBaseUrls } from "../runtime/stage30DgxEndpoints";
import { createDgxOrchestratorJsonHeaders } from "../runtime/stage31DgxAuth";

/**
 * Thin fetch client for the server's `/rmas` endpoints — the desktop is a pure
 * viewer of a server-side goal loop (the loop keeps running when the app is
 * closed; "자고 와도 이어본다"). Mirrors `codingAgentClient.ts`: same base-url
 * resolution + the same signed/Bearer auth headers, so the orchestrator token
 * is sent on every call. Never uses `EventSource` (can't set a Bearer header);
 * the live trace stream is read with fetch+ReadableStream in `stage48RmasStream`.
 */

export type RmasClientOptions = {
  serverBaseUrl?: string | string[];
  fetchImpl?: typeof fetch;
};

/** Structured error so the UI can distinguish 429-at-capacity from other faults. */
export class RmasClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    /** for 429 rmas_at_capacity — the server's configured concurrency cap */
    readonly maxConcurrent?: number,
  ) {
    super(message);
    this.name = "RmasClientError";
  }
}

function firstBaseUrl(options?: RmasClientOptions): string {
  const explicit = resolveDgxServerBaseUrls(options?.serverBaseUrl);
  if (explicit[0]) return explicit[0];
  const configured = resolveConfiguredDgxServerBaseUrls();
  return configured[0] ?? "http://127.0.0.1:8787";
}

type ErrorBody = { error?: string; message?: string; maxConcurrent?: number };

async function requestJson<T>(
  method: "GET" | "POST",
  path: string,
  options: RmasClientOptions | undefined,
  body?: unknown,
): Promise<T> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const baseUrl = firstBaseUrl(options);
  const bodyText = body === undefined ? undefined : JSON.stringify(body);
  const headers = await createDgxOrchestratorJsonHeaders(
    method,
    path,
    // targetUrl must be the FULL request URL (base+path), not the bare base:
    // on a plain-http target the HMAC branch signs `new URL(targetUrl).pathname`,
    // so a bare base signs "/" while the server verifies the real path → 401.
    `${baseUrl}${path}`,
    bodyText === undefined ? {} : { body: bodyText },
  );
  const response = await fetchImpl(`${baseUrl}${path}`, {
    method,
    headers,
    ...(bodyText === undefined ? {} : { body: bodyText }),
  });
  let payload: (T & ErrorBody) | undefined;
  try {
    payload = (await response.json()) as T & ErrorBody;
  } catch {
    payload = undefined;
  }
  if (!response.ok) {
    const code = payload?.error;
    const detail = code
      ? `${code}${payload?.message ? `: ${payload.message}` : ""}`
      : `HTTP ${response.status}`;
    throw new RmasClientError(detail, response.status, code, payload?.maxConcurrent);
  }
  if (payload === undefined) {
    throw new RmasClientError(`빈 응답 (HTTP ${response.status})`, response.status);
  }
  return payload as T;
}

/** POST /rmas/runs — start a run. Throws RmasClientError(status 429) when busy. */
export async function startRmasRun(
  config: RmasRunConfig,
  options?: RmasClientOptions,
): Promise<{ runId: string; run: RmasRunRecord }> {
  return requestJson<{ runId: string; run: RmasRunRecord }>("POST", "/rmas/runs", options, config);
}

/** GET /rmas/runs — newest-first summary list (history + reattach discovery). */
export async function listRmasRuns(options?: RmasClientOptions): Promise<RmasRunSummary[]> {
  const payload = await requestJson<{ runs: RmasRunSummary[] }>("GET", "/rmas/runs", options);
  return payload.runs ?? [];
}

/** GET /rmas/runs/:id — full materialized snapshot (reattach). */
export async function getRmasRun(runId: string, options?: RmasClientOptions): Promise<RmasRunRecord> {
  const payload = await requestJson<{ run: RmasRunRecord }>(
    "GET",
    `/rmas/runs/${encodeURIComponent(runId)}`,
    options,
  );
  return payload.run;
}

/** POST /rmas/runs/:id/stop — request a stop (idempotent). */
export async function stopRmasRun(
  runId: string,
  options?: RmasClientOptions,
): Promise<{ stopRequested: boolean; run: RmasRunRecord }> {
  return requestJson<{ stopRequested: boolean; run: RmasRunRecord }>(
    "POST",
    `/rmas/runs/${encodeURIComponent(runId)}/stop`,
    options,
  );
}
