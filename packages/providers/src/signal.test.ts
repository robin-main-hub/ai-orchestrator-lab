import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequestSignal } from "./signal";
import type { AdapterRuntimeContext } from "./adapter";

// createRequestSignal decides the AbortSignal every streaming/non-streaming
// adapter call (anthropic/ollama/openAiCompatible) hands to fetch. It does NO
// network and NO I/O — it only combines a caller cancellation signal with a
// per-call timeout. It was never pinned. Four authority facts protect it:
// (1) ZERO-WRAP PASSTHROUGH — when no timeout is set the caller's signal is
// returned verbatim (same reference) and `undefined` stays `undefined`, so the
// common no-timeout path adds no machinery; timeoutMs:0 is falsy and counts as
// no-timeout. (2) TIMEOUT FIRES — with a timeout and no caller signal, the
// derived signal starts un-aborted and aborts exactly when the timer elapses.
// (3) WHICHEVER-FIRST CANCEL — with both a timeout and a caller signal, the
// derived signal aborts as soon as the CALLER aborts (before the timer), and a
// caller that is ALREADY aborted yields an already-aborted derived signal
// synchronously. (4) ALWAYS A FRESH SIGNAL UNDER TIMEOUT — under any timeout the
// returned signal is a NEW controller signal, never the caller's own, so the
// timeout can never leak back onto the caller's signal. Fake timers make the
// timeout deterministic; no real clock dependence.

const ctx = (over: Partial<AdapterRuntimeContext>): AdapterRuntimeContext => ({
  resolveSecret: async () => undefined,
  ...over,
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createRequestSignal — zero-wrap passthrough when no timeout", () => {
  it("returns undefined when there is neither a timeout nor a caller signal", () => {
    expect(createRequestSignal(ctx({}))).toBeUndefined();
  });

  it("returns the caller signal verbatim (same reference, no wrapping)", () => {
    const ac = new AbortController();
    expect(createRequestSignal(ctx({ abortSignal: ac.signal }))).toBe(ac.signal);
  });

  it("treats timeoutMs:0 as no-timeout (falsy) and passes the caller signal through", () => {
    const ac = new AbortController();
    expect(createRequestSignal(ctx({ abortSignal: ac.signal, timeoutMs: 0 }))).toBe(ac.signal);
  });
});

describe("createRequestSignal — derived signal under a timeout", () => {
  it("starts un-aborted and aborts exactly when the timer elapses", () => {
    vi.useFakeTimers();
    const sig = createRequestSignal(ctx({ timeoutMs: 50 }))!;
    expect(sig).toBeDefined();
    expect(sig.aborted).toBe(false);
    vi.advanceTimersByTime(49);
    expect(sig.aborted).toBe(false); // not yet
    vi.advanceTimersByTime(1);
    expect(sig.aborted).toBe(true); // fired at 50ms
  });

  it("returns a FRESH signal, never the caller's own, when a timeout is present", () => {
    vi.useFakeTimers();
    const ac = new AbortController();
    const sig = createRequestSignal(ctx({ abortSignal: ac.signal, timeoutMs: 1000 }))!;
    expect(sig).not.toBe(ac.signal);
  });

  it("aborts as soon as the CALLER aborts, before the timer fires (whichever first)", () => {
    vi.useFakeTimers();
    const ac = new AbortController();
    const sig = createRequestSignal(ctx({ abortSignal: ac.signal, timeoutMs: 10_000 }))!;
    expect(sig.aborted).toBe(false);
    ac.abort();
    expect(sig.aborted).toBe(true); // caller cancel wins over the still-pending timeout
  });

  it("yields an already-aborted derived signal synchronously when the caller is already aborted", () => {
    vi.useFakeTimers();
    const ac = new AbortController();
    ac.abort();
    const sig = createRequestSignal(ctx({ abortSignal: ac.signal, timeoutMs: 10_000 }))!;
    expect(sig.aborted).toBe(true); // no timer advance needed
    expect(sig).not.toBe(ac.signal);
  });
});
