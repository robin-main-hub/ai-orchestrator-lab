import { expect } from "vitest";

/**
 * Batch 16 LINE E — the Assistant Inbox interaction invariant, upgraded from
 * "zero <button>" to "no side-effect action controls".
 *
 * Philosophy: a `<button>` is NOT the enemy — a side-effect OS action is. The
 * inbox is a fast operator cockpit, so local VIEW controls (command deck, view
 * toggles, saved-view apply, detail open/close, jump/focus) are allowed. What
 * stays forbidden is any control that *does* something to the OS (send, approve,
 * write, append, run, apply patch, dispatch, sync, execute, …).
 *
 * Enforcement model:
 *   - Every <button> and [role="button"] MUST carry an allowed data-action-scope
 *     (local-view / local-preference / local-detail) and have a label free of
 *     forbidden side-effect words. This is the real, legible invariant.
 *   - Radios/checkboxes are single-choice view state (already role=radiogroup
 *     semantics); they are word-probed but not scope-required, so the existing
 *     sr-only filter radios stay untouched.
 *
 * Used by inbox tests in place of `querySelectorAll("button").length === 0`.
 */

export const ALLOWED_ACTION_SCOPES = ["local-view", "local-preference", "local-detail"] as const;
export type AllowedActionScope = (typeof ALLOWED_ACTION_SCOPES)[number];

/**
 * Side-effect ACTION words forbidden in a control's label/aria-label. Tuned to
 * avoid false positives on legitimate local labels:
 *   - "run "/"run-" (not bare "run" → "Runner" is fine)
 *   - "apply patch"/"apply-patch" (not bare "apply" → "Apply view" is fine)
 * Note: "external" is intentionally NOT here — it is a generic noun in this OS
 * ("External Source Deck", "external-source"), not an action.
 */
export const FORBIDDEN_ACTION_WORDS = [
  "approve",
  "enable",
  "send",
  "append",
  "run ",
  "run-",
  "apply patch",
  "apply-patch",
  "dispatch",
  "sync",
  "execute",
  "reconnect",
  "refresh",
  "write",
  "load",
  "import",
] as const;

/**
 * Narrower list for whole-surface TEXT scans. Excludes noun-collision words that
 * legitimately appear in generic copy ("External Source Deck", "eventLog", …) so
 * a body scan never false-positives.
 */
export const FORBIDDEN_TEXT_WORDS = [
  "approve",
  "enable",
  "send",
  "dispatch",
  "run ",
  "apply patch",
  "append",
  "reconnect",
] as const;

const CONTROL_SELECTOR = 'button, [role="button"], input[type="radio"], input[type="checkbox"]';

/** Every interactive control under `root` (buttons, role=button, radios, checkboxes). */
export function collectActionControls(root: Element): Element[] {
  return Array.from(root.querySelectorAll(CONTROL_SELECTOR));
}

function labelText(el: Element): string {
  return `${el.textContent ?? ""} ${el.getAttribute("aria-label") ?? ""}`.toLowerCase().trim();
}

/**
 * Assert `root` exposes no side-effect action control. Replacement for the old
 * `expect(querySelectorAll("button").length).toBe(0)`:
 *   - each <button> / [role=button] must carry an allowed data-action-scope, and
 *   - every control's label must be free of FORBIDDEN_ACTION_WORDS.
 */
export function assertNoSideEffectActionControls(root: Element): void {
  for (const el of collectActionControls(root)) {
    const label = labelText(el);
    const isButtonLike = el.tagName.toLowerCase() === "button" || el.getAttribute("role") === "button";
    if (isButtonLike) {
      const scope = el.getAttribute("data-action-scope");
      const ok = scope != null && (ALLOWED_ACTION_SCOPES as readonly string[]).includes(scope);
      expect(ok, `control "${label}" must carry an allowed data-action-scope (got ${scope ?? "none"})`).toBe(
        true,
      );
    }
    for (const w of FORBIDDEN_ACTION_WORDS) {
      expect(label.includes(w), `control "${label}" must not contain side-effect word "${w}"`).toBe(false);
    }
  }
}

/** Assert the rendered text under `root` contains no forbidden side-effect action word. */
export function assertNoForbiddenActionText(root: Element): void {
  const text = (root.textContent ?? "").toLowerCase();
  for (const w of FORBIDDEN_TEXT_WORDS) {
    expect(text.includes(w), `surface text must not contain side-effect word "${w}"`).toBe(false);
  }
}
