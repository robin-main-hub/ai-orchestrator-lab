import type { AdapterRuntimeContext } from "./adapter.js";

/**
 * Combine an `AdapterRuntimeContext`'s `timeoutMs` and `abortSignal`
 * into a single `AbortSignal` that fires on whichever happens first.
 *
 * Returns:
 *   - `ctx.abortSignal` directly when no timeout is configured (no
 *     extra controller needed)
 *   - `undefined` when neither timeout nor incoming signal is set
 *   - a fresh controller signal that aborts when either the timeout
 *     elapses OR the incoming abortSignal fires
 *
 * The timeout uses `unref()` (when available) so a pending timer
 * never holds the Node process open past the request.
 *
 * History: this helper was duplicated nearly verbatim in three
 * adapters (anthropic / ollama / openAiCompatible). Extracted here
 * during the cleanup audit so the timeout/abort semantics live in
 * one place. Test coverage flows through each adapter's existing
 * happy-path/abort tests.
 */
export function createRequestSignal(ctx: AdapterRuntimeContext): AbortSignal | undefined {
  if (!ctx.timeoutMs) {
    return ctx.abortSignal;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ctx.timeoutMs);
  // Node `Timeout` exposes `unref`; the DOM `setTimeout` returns a number with
  // no such method. Both paths are handled defensively so the helper is safe
  // in browser builds (desktop renderer, future mobile) where there is no
  // process to keep alive.
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
