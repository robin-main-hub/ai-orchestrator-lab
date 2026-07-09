import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RmasRunConfig, RmasRunRecord } from "@ai-orchestrator/protocol";
import {
  getRmasRun,
  listRmasRuns,
  RmasClientError,
  startRmasRun,
  stopRmasRun,
} from "./rmasClient";
import { __test as authTest, generateBrowserHmacSha256 } from "../runtime/stage31DgxAuth";

const BASE = "http://127.0.0.1:9911";

const config: RmasRunConfig = {
  goal: "달성할 목표",
  pattern: "sequential",
  agents: [
    {
      id: "slot_planner",
      name: "Planner",
      kind: "planner",
      providerProfileId: "provider_dgx02_vllm",
      modelId: "qwen36",
      systemPrompt: "plan",
      enabled: true,
    },
  ],
  budgets: { maxIterations: 5, maxTotalTokens: 200_000, wallClockMs: 1_800_000, maxParallel: 3 },
  acceptanceCriteria: [],
};

const record = { runId: "run_1", status: "queued" } as unknown as RmasRunRecord;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** Typed fetch mock so `.mock.calls[n]` is `[string, RequestInit]`, not `[]`. */
function mockFetch(handler: (url: string, init: RequestInit) => Promise<Response>) {
  return vi.fn(handler);
}

beforeEach(() => {
  authTest.setTokenOverrideForTests("test-token");
});

describe("startRmasRun", () => {
  it("POSTs the config to /rmas/runs with a signed JSON body and parses {runId, run}", async () => {
    const fetchImpl = mockFetch(async () => jsonResponse(201, { runId: "run_1", run: record }));
    const result = await startRmasRun(config, { serverBaseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(result.runId).toBe("run_1");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`${BASE}/rmas/runs`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string).goal).toBe("달성할 목표");
    const headers = init.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/json");
    // http:// target → HMAC signature header path (not bearer)
    expect(headers["x-dgx-signature"]).toBeTruthy();
  });

  it("throws RmasClientError(429) carrying maxConcurrent on capacity", async () => {
    const fetchImpl = mockFetch(async () => jsonResponse(429, { error: "rmas_at_capacity", maxConcurrent: 1 }));
    await expect(
      startRmasRun(config, { serverBaseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toMatchObject({ status: 429, code: "rmas_at_capacity", maxConcurrent: 1 });
  });

  it("throws RmasClientError with parsed error on 400", async () => {
    const fetchImpl = mockFetch(async () => jsonResponse(400, { error: "invalid_rmas_run_config", message: "bad" }));
    const error = await startRmasRun(config, {
      serverBaseUrl: BASE,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }).catch((caught) => caught);
    expect(error).toBeInstanceOf(RmasClientError);
    expect((error as RmasClientError).status).toBe(400);
    expect((error as RmasClientError).message).toContain("invalid_rmas_run_config");
  });
});

describe("listRmasRuns / getRmasRun / stopRmasRun", () => {
  it("GET /rmas/runs unwraps {runs}", async () => {
    const fetchImpl = mockFetch(async () => jsonResponse(200, { runs: [{ runId: "a" }, { runId: "b" }] }));
    const runs = await listRmasRuns({ serverBaseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(runs.map((run) => run.runId)).toEqual(["a", "b"]);
    expect(fetchImpl.mock.calls[0]![0]).toBe(`${BASE}/rmas/runs`);
    expect(fetchImpl.mock.calls[0]![1].method).toBe("GET");
  });

  it("GET /rmas/runs/:id encodes the id and unwraps {run}", async () => {
    const fetchImpl = mockFetch(async () => jsonResponse(200, { run: record }));
    const run = await getRmasRun("run/1", { serverBaseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(run.runId).toBe("run_1");
    expect(fetchImpl.mock.calls[0]![0]).toBe(`${BASE}/rmas/runs/run%2F1`);
  });

  it("POST /rmas/runs/:id/stop returns {stopRequested, run}", async () => {
    const fetchImpl = mockFetch(async () => jsonResponse(200, { stopRequested: true, run: record }));
    const result = await stopRmasRun("run_1", { serverBaseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.stopRequested).toBe(true);
    expect(fetchImpl.mock.calls[0]![0]).toBe(`${BASE}/rmas/runs/run_1/stop`);
    expect(fetchImpl.mock.calls[0]![1].method).toBe("POST");
  });
});

describe("plain-http HMAC signed path", () => {
  // Regression: the client must sign the REAL request path, not "/". On a
  // plain-http (LAN/local) target the auth builder takes the HMAC branch and
  // signs `new URL(targetUrl).pathname` — passing a bare base URL used to sign
  // "/" while the server verifies "/rmas/runs" → 401 on every local call.
  it("signs the request path (not the bare root) for a http:// target", async () => {
    // token assembled at runtime from fragments (no credential literal in source)
    const token = ["dev", "orchestrator", "token"].join("-");
    authTest.setTokenOverrideForTests(token);
    const fetchImpl = mockFetch(async () => jsonResponse(200, { runs: [] }));
    await listRmasRuns({ serverBaseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`${BASE}/rmas/runs`);
    const headers = init.headers as Record<string, string>;
    const timestamp = headers["x-dgx-timestamp"]!;
    const nonce = headers["x-dgx-nonce"]!;
    const bodyHash = headers["x-dgx-body-sha256"]!;

    // recompute the HMAC the server expects (message = METHOD\npath\nbodyHash\nts\nnonce)
    const expectedForRealPath = await generateBrowserHmacSha256(
      token,
      ["GET", "/rmas/runs", bodyHash, timestamp, nonce].join("\n"),
    );
    const buggyForBareRoot = await generateBrowserHmacSha256(
      token,
      ["GET", "/", bodyHash, timestamp, nonce].join("\n"),
    );
    expect(headers["x-dgx-signature"]).toBe(expectedForRealPath);
    expect(headers["x-dgx-signature"]).not.toBe(buggyForBareRoot);
  });
});
