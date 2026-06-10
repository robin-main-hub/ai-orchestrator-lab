import { describe, expect, it } from "vitest";
import { AuthRateLimiter, resolveClientKey } from "./authRateLimiter.js";

function limiterAt(startMs = 0, options: ConstructorParameters<typeof AuthRateLimiter>[0] = {}) {
  let now = startMs;
  const limiter = new AuthRateLimiter({ maxFailures: 3, windowMs: 1_000, ...options, now: () => now });
  return { limiter, advance: (ms: number) => (now += ms) };
}

describe("AuthRateLimiter", () => {
  it("does not block under the failure threshold", () => {
    const { limiter } = limiterAt();
    limiter.recordFailure("ip1");
    limiter.recordFailure("ip1");
    expect(limiter.isBlocked("ip1")).toBe(false);
  });

  it("blocks after maxFailures within the window", () => {
    const { limiter } = limiterAt();
    for (let i = 0; i < 3; i += 1) limiter.recordFailure("ip1");
    expect(limiter.isBlocked("ip1")).toBe(true);
  });

  it("unblocks after the window expires", () => {
    const { limiter, advance } = limiterAt();
    for (let i = 0; i < 3; i += 1) limiter.recordFailure("ip1");
    advance(1_001);
    expect(limiter.isBlocked("ip1")).toBe(false);
  });

  it("a successful auth clears the counter", () => {
    const { limiter } = limiterAt();
    for (let i = 0; i < 3; i += 1) limiter.recordFailure("ip1");
    limiter.recordSuccess("ip1");
    expect(limiter.isBlocked("ip1")).toBe(false);
  });

  it("tracks clients independently", () => {
    const { limiter } = limiterAt();
    for (let i = 0; i < 3; i += 1) limiter.recordFailure("ip1");
    expect(limiter.isBlocked("ip1")).toBe(true);
    expect(limiter.isBlocked("ip2")).toBe(false);
  });

  it("a failure after the window starts a fresh window instead of accumulating", () => {
    const { limiter, advance } = limiterAt();
    limiter.recordFailure("ip1");
    limiter.recordFailure("ip1");
    advance(1_001);
    limiter.recordFailure("ip1");
    limiter.recordFailure("ip1");
    expect(limiter.isBlocked("ip1")).toBe(false); // 2 in the new window, not 4
  });

  it("bounds tracked clients by evicting expired then oldest entries", () => {
    const { limiter, advance } = limiterAt(0, { maxClients: 2 });
    limiter.recordFailure("a");
    advance(10);
    limiter.recordFailure("b");
    advance(10);
    limiter.recordFailure("c"); // at cap with live entries -> evicts oldest ("a")
    expect(limiter.trackedClients()).toBe(2);
    expect(limiter.isBlocked("c")).toBe(false);
  });
});

describe("resolveClientKey", () => {
  it("prefers cf-connecting-ip, then socket address, then unknown", () => {
    expect(
      resolveClientKey({ headers: { "cf-connecting-ip": "1.2.3.4" }, socket: { remoteAddress: "10.0.0.1" } } as never),
    ).toBe("1.2.3.4");
    expect(resolveClientKey({ headers: {}, socket: { remoteAddress: "10.0.0.1" } } as never)).toBe("10.0.0.1");
    expect(resolveClientKey({ headers: {}, socket: {} } as never)).toBe("unknown");
  });
});
