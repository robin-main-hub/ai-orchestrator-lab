import { describe, expect, it, vi } from "vitest";
import { acquireStorageLock, evaluateStorageLock, type StorageLockRecord } from "./storageLock.js";

const lock = (overrides: Partial<StorageLockRecord> = {}): StorageLockRecord => ({
  pid: 4242,
  port: 4317,
  acquiredAt: "2026-06-10T00:00:00.000Z",
  ...overrides,
});

describe("evaluateStorageLock", () => {
  it("acquires when there is no existing lock", () => {
    expect(evaluateStorageLock({ existingLock: null, selfPid: 1, isPidAlive: () => true }).action).toBe("acquire");
  });

  it("re-acquires its own lock", () => {
    expect(
      evaluateStorageLock({ existingLock: lock({ pid: 7 }), selfPid: 7, isPidAlive: () => true }).action,
    ).toBe("acquire");
  });

  it("takes over a lock whose holder is no longer running", () => {
    const decision = evaluateStorageLock({ existingLock: lock({ pid: 99 }), selfPid: 1, isPidAlive: () => false });
    expect(decision.action).toBe("takeover_stale");
    expect(decision.reason).toContain("99");
  });

  it("reports contention when another live process holds the dir", () => {
    const decision = evaluateStorageLock({
      existingLock: lock({ pid: 99, port: 4317 }),
      selfPid: 1,
      isPidAlive: () => true,
    });
    expect(decision.action).toBe("contended");
    expect(decision.reason).toContain("4317");
  });
});

describe("acquireStorageLock", () => {
  it("writes a lock record when the dir is free", async () => {
    const writeFileImpl = vi.fn().mockResolvedValue(undefined);
    const readFileImpl = vi.fn().mockRejectedValue(Object.assign(new Error("nope"), { code: "ENOENT" }));
    const result = await acquireStorageLock({
      lockPath: "/x/events.lock",
      selfPid: 11,
      port: 4317,
      now: () => "2026-06-10T00:00:00.000Z",
      readFileImpl,
      writeFileImpl,
    });
    expect(result.acquired).toBe(true);
    expect(writeFileImpl).toHaveBeenCalledOnce();
    expect(writeFileImpl.mock.calls[0]?.[1]).toContain('"pid":11');
  });

  it("takes over and rewrites a stale (dead-holder) lock", async () => {
    const writeFileImpl = vi.fn().mockResolvedValue(undefined);
    const readFileImpl = vi.fn().mockResolvedValue(JSON.stringify({ pid: 99, acquiredAt: "2026-06-10T00:00:00.000Z" }));
    const result = await acquireStorageLock({
      lockPath: "/x/events.lock",
      selfPid: 11,
      isPidAlive: () => false,
      readFileImpl,
      writeFileImpl,
    });
    expect(result.decision.action).toBe("takeover_stale");
    expect(result.acquired).toBe(true);
    expect(writeFileImpl).toHaveBeenCalledOnce();
  });

  it("warns and does NOT steal the lock from a live holder (advisory mode)", async () => {
    const writeFileImpl = vi.fn();
    const readFileImpl = vi.fn().mockResolvedValue(JSON.stringify({ pid: 99, port: 4317, acquiredAt: "t" }));
    const logger = vi.fn();
    const result = await acquireStorageLock({
      lockPath: "/x/events.lock",
      selfPid: 11,
      isPidAlive: () => true,
      readFileImpl,
      writeFileImpl,
      logger,
    });
    expect(result.acquired).toBe(false);
    expect(writeFileImpl).not.toHaveBeenCalled();
    expect(logger).toHaveBeenCalledOnce();
  });

  it("throws on contention in strict mode", async () => {
    const readFileImpl = vi.fn().mockResolvedValue(JSON.stringify({ pid: 99, acquiredAt: "t" }));
    await expect(
      acquireStorageLock({
        lockPath: "/x/events.lock",
        selfPid: 11,
        isPidAlive: () => true,
        strict: true,
        readFileImpl,
        writeFileImpl: vi.fn(),
      }),
    ).rejects.toThrow(/corrupt approval state/);
  });

  it("treats a corrupt lock file as absent and acquires", async () => {
    const writeFileImpl = vi.fn().mockResolvedValue(undefined);
    const readFileImpl = vi.fn().mockResolvedValue("{ this is not json");
    const result = await acquireStorageLock({
      lockPath: "/x/events.lock",
      selfPid: 11,
      readFileImpl,
      writeFileImpl,
    });
    expect(result.acquired).toBe(true);
  });
});
