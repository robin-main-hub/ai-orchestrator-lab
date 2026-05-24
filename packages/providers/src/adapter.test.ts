import { describe, expect, it } from "vitest";
import { createAdapterContext } from "./adapter";

describe("createAdapterContext", () => {
  it("returns a resolver for a literal secret", async () => {
    const ctx = createAdapterContext({ secret: "sk-literal" });
    await expect(ctx.resolveSecret()).resolves.toBe("sk-literal");
  });

  it("forwards a resolver function", async () => {
    let calls = 0;
    const ctx = createAdapterContext({
      secret: async () => {
        calls += 1;
        return `dynamic-${calls}`;
      },
    });
    await expect(ctx.resolveSecret()).resolves.toBe("dynamic-1");
    await expect(ctx.resolveSecret()).resolves.toBe("dynamic-2");
  });

  it("returns undefined when no secret is provided", async () => {
    const ctx = createAdapterContext();
    await expect(ctx.resolveSecret()).resolves.toBeUndefined();
  });

  it("passes through abortSignal, timeoutMs, and onRawError", () => {
    const controller = new AbortController();
    const onRawError = () => {};
    const ctx = createAdapterContext({
      abortSignal: controller.signal,
      timeoutMs: 5_000,
      onRawError,
    });
    expect(ctx.abortSignal).toBe(controller.signal);
    expect(ctx.timeoutMs).toBe(5_000);
    expect(ctx.onRawError).toBe(onRawError);
  });
});
