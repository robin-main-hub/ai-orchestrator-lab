import type { AdapterRuntimeContext } from "./adapter";

/**
 * Resolves the AbortSignal that a single adapter HTTP call should pass
 * into `fetch`. Combines two inputs from {@link AdapterRuntimeContext}:
 *
 *  - `ctx.abortSignal` — caller-provided cancellation (e.g. the user
 *    backs out of a request, or the desktop run loop is shutting down).
 *  - `ctx.timeoutMs` — per-call timeout. When set, we wrap an internal
 *    AbortController so the request aborts either when the timeout fires
 *    or when the caller's signal aborts, whichever comes first.
 *
 * Extracted from anthropicAdapter / ollamaAdapter / openAiCompatibleAdapter
 * which had three near-identical copies of this logic. Keeping a single
 * source means any future tweak (e.g. surfacing a timeout-vs-cancel
 * distinction) lands in one place.
 *
 * Behavior is intentionally identical to the previous in-adapter copies:
 *  - No timeout, no caller signal → undefined (fetch goes unguarded).
 *  - Caller signal only → return it as-is (no extra wrapping).
 *  - Timeout (with or without caller signal) → return a derived signal
 *    that aborts on whichever fires first. The timeout is `unref`'d so
 *    Node.js does not keep the event loop alive solely for it.
 */
export function createRequestSignal(ctx: AdapterRuntimeContext): AbortSignal | undefined {
  if (!ctx.timeoutMs) {
    return ctx.abortSignal;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ctx.timeoutMs);
  // setTimeout returns a Node `Timeout` object in Node, a number in
  // browsers. `unref` only exists on Node; the cast keeps DOM lib
  // compatibility while still calling unref when available.
  (timeout as unknown as { unref?: () => void }).unref?.();
  if (ctx.abortSignal) {
    if (ctx.abortSignal.aborted) {
      controller.abort();
    } else {
      ctx.abortSignal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }
  controller.signal.addEventListener("abort", () => clearTimeout(timeout), { once: true });
  return controller.signal;
}
