import { describe, expect, it, vi } from "vitest";
import { ConnectionHealthMonitor } from "./connectionHealth.js";

const NOW = "2026-05-26T00:00:00.000Z";

function makeFetch(opts: { ok: boolean; status?: number; delayMs?: number }) {
  return async (_url: string, _init?: RequestInit): Promise<Response> => {
    if (opts.delayMs) {
      await new Promise((r) => setTimeout(r, opts.delayMs));
    }
    if (!opts.ok) {
      throw new Error("network error");
    }
    return { ok: opts.ok, status: opts.status ?? 200 } as Response;
  };
}

describe("ConnectionHealthMonitor", () => {
  it("starts as offline before first check", () => {
    const m = new ConnectionHealthMonitor({
      healthUrl: "http://dgx-02/health",
      now: () => NOW,
    });
    expect(m.status).toBe("offline");
  });

  it("transitions to online on successful fast response", async () => {
    const m = new ConnectionHealthMonitor({
      healthUrl: "http://dgx-02/health",
      fetch: makeFetch({ ok: true }),
      now: () => NOW,
    });
    const snap = await m.check();
    expect(snap.status).toBe("online");
    expect(snap.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("transitions to offline when fetch throws", async () => {
    const m = new ConnectionHealthMonitor({
      healthUrl: "http://dgx-02/health",
      fetch: makeFetch({ ok: false }),
      now: () => NOW,
    });
    const snap = await m.check();
    expect(snap.status).toBe("offline");
    expect(snap.latencyMs).toBeNull();
    expect(snap.errorMessage).toBeDefined();
  });

  it("transitions to degraded on non-2xx response", async () => {
    const m = new ConnectionHealthMonitor({
      healthUrl: "http://dgx-02/health",
      fetch: async () => ({ ok: false, status: 503 } as Response),
      now: () => NOW,
    });
    const snap = await m.check();
    expect(snap.status).toBe("degraded");
    expect(snap.errorMessage).toContain("503");
  });

  it("transitions to syncing when server returns and pending items exist", async () => {
    const m = new ConnectionHealthMonitor({
      healthUrl: "http://dgx-02/health",
      fetch: makeFetch({ ok: true }),
      pendingCountFn: () => 3,
      now: () => NOW,
    });
    // First check: offline → online with pending → syncing
    const snap = await m.check();
    expect(snap.status).toBe("syncing");
    expect(snap.pendingCount).toBe(3);
  });

  it("fires status-change listener on transition", async () => {
    const changes: string[] = [];
    const m = new ConnectionHealthMonitor({
      healthUrl: "http://dgx-02/health",
      fetch: makeFetch({ ok: true }),
      now: () => NOW,
    });
    m.onStatusChange((s) => changes.push(s.status));
    await m.check();
    expect(changes).toEqual(["online"]);
    // Second check with same status — no event
    await m.check();
    expect(changes).toHaveLength(1);
  });

  it("unsubscribe removes listener", async () => {
    const changes: string[] = [];
    const m = new ConnectionHealthMonitor({
      healthUrl: "http://dgx-02/health",
      fetch: makeFetch({ ok: true }),
      now: () => NOW,
    });
    const off = m.onStatusChange((s) => changes.push(s.status));
    off();
    await m.check();
    expect(changes).toHaveLength(0);
  });

  it("start/stop controls the heartbeat timer", () => {
    vi.useFakeTimers();
    const checks: number[] = [];
    const m = new ConnectionHealthMonitor({
      healthUrl: "http://dgx-02/health",
      heartbeatIntervalMs: 1_000,
      fetch: async () => {
        checks.push(Date.now());
        return { ok: true, status: 200 } as Response;
      },
      now: () => NOW,
    });
    m.start();
    vi.advanceTimersByTime(3_500);
    m.stop();
    expect(checks.length).toBe(3);
    vi.useRealTimers();
  });
});
