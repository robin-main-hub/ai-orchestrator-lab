import { describe, expect, it, vi } from "vitest";
import { probeDgxProviderRoutes } from "./stage32DgxRouteDiagnostics";

describe("stage32 DGX route diagnostics", () => {
  it("checks health and provider preflight per DGX route", async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(url)}`);
      return new Response(String(url).includes("/health") ? "{\"status\":\"ok\"}" : "", {
        status: 200,
      });
    };

    const snapshot = await probeDgxProviderRoutes({
      fetchImpl,
      serverBaseUrl: ["http://dgx-02:4317", "https://orchestrator.endruin.com"],
      checkedAt: "2026-05-25T00:00:00.000Z",
    });

    expect(calls).toEqual([
      "GET http://dgx-02:4317/health",
      "OPTIONS http://dgx-02:4317/provider-completions",
      "GET https://orchestrator.endruin.com/health",
      "OPTIONS https://orchestrator.endruin.com/provider-completions",
    ]);
    expect(snapshot.summary.ok).toBe(4);
    expect(snapshot.routes[0]?.health.status).toBe("ok");
    expect(snapshot.routes[0]?.providerPreflight.method).toBe("OPTIONS");
  });

  it("separates network errors from HTTP proxy errors", async () => {
    const fetchImpl = async (url: RequestInfo | URL) => {
      if (String(url).startsWith("http://dgx-02")) {
        throw new TypeError("Failed to fetch");
      }
      return new Response("bad gateway", { status: 502 });
    };

    const snapshot = await probeDgxProviderRoutes({
      fetchImpl,
      serverBaseUrl: ["http://dgx-02:4317", "https://orchestrator.endruin.com"],
    });

    expect(snapshot.summary.networkError).toBe(2);
    expect(snapshot.summary.httpError).toBe(2);
    expect(snapshot.routes[0]?.health.error).toBe("Failed to fetch");
    expect(snapshot.routes[1]?.health.httpStatus).toBe(502);
    expect(snapshot.routes[1]?.health.bodyPreview).toBe("bad gateway");
  });

  it("marks aborted route probes as timeout", async () => {
    vi.useFakeTimers();
    const fetchImpl = async (_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });

    const pending = probeDgxProviderRoutes({
      fetchImpl,
      serverBaseUrl: "http://dgx-02:4317",
      timeoutMs: 10,
    });
    await vi.advanceTimersByTimeAsync(10);
    const snapshot = await pending;
    vi.useRealTimers();

    expect(snapshot.summary.timeout).toBe(2);
    expect(snapshot.routes[0]?.health.status).toBe("timeout");
    expect(snapshot.routes[0]?.providerPreflight.status).toBe("timeout");
  });
});
