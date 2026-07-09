// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRunningRmasRuns } from "./useRunningRmasRuns";

type Call = { url: string; method: string };

function makeFetch(calls: Call[], listBody: unknown) {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    const body = url.includes("/stop")
      ? { stopRequested: true, run: { runId: "x", status: "stopped" } }
      : listBody;
    return {
      ok: true,
      status: 200,
      json: async () => body,
    } as unknown as Response;
  }) as typeof fetch;
}

const runsBody = {
  runs: [
    { runId: "run_a", status: "running", pattern: "debate", goalPreview: "목표 A", iterations: 1, tokens: { input: 0, output: 0, total: 0 }, accepted: false, createdAt: "2026-06-05T08:00:00.000Z" },
    { runId: "run_b", status: "queued", pattern: "debate", goalPreview: "목표 B", iterations: 0, tokens: { input: 0, output: 0, total: 0 }, accepted: false, createdAt: "2026-06-05T08:01:00.000Z" },
    { runId: "run_c", status: "completed", pattern: "debate", goalPreview: "목표 C", iterations: 3, tokens: { input: 0, output: 0, total: 0 }, accepted: true, createdAt: "2026-06-05T08:02:00.000Z" },
  ],
};

afterEach(() => vi.restoreAllMocks());

describe("useRunningRmasRuns", () => {
  it("polls the runs list and exposes only running/queued runs as work items", async () => {
    const calls: Call[] = [];
    const { result } = renderHook(() =>
      useRunningRmasRuns({ serverBaseUrl: "http://127.0.0.1:4317", fetchImpl: makeFetch(calls, runsBody), pollIntervalMs: 1_000_000 }),
    );

    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(result.current.items.map((item) => item.id)).toEqual(["run_a", "run_b"]);
    expect(result.current.items[0]).toMatchObject({ label: "목표 A", status: "running", kind: "rmas" });
    expect(result.current.items[1]).toMatchObject({ label: "목표 B", status: "queued", kind: "rmas" });
    expect(calls.some((call) => call.url.endsWith("/rmas/runs") && call.method === "GET")).toBe(true);
  });

  it("stop() posts to the run's stop endpoint and refreshes", async () => {
    const calls: Call[] = [];
    const { result } = renderHook(() =>
      useRunningRmasRuns({ serverBaseUrl: "http://127.0.0.1:4317", fetchImpl: makeFetch(calls, runsBody), pollIntervalMs: 1_000_000 }),
    );
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    await act(async () => {
      result.current.stop("run_a");
    });

    await waitFor(() =>
      expect(calls.some((call) => call.url.endsWith("/rmas/runs/run_a/stop") && call.method === "POST")).toBe(true),
    );
  });

  it("does not poll when disabled", async () => {
    const calls: Call[] = [];
    renderHook(() =>
      useRunningRmasRuns({ serverBaseUrl: "http://127.0.0.1:4317", fetchImpl: makeFetch(calls, runsBody), enabled: false }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls).toHaveLength(0);
  });
});
