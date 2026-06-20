// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  ALLOWED_ACTION_SCOPES,
  FORBIDDEN_ACTION_WORDS,
  FORBIDDEN_TEXT_WORDS,
  assertNoForbiddenActionText,
  assertNoSideEffectActionControls,
  collectActionControls,
} from "./inboxInvariant";

// Characterization tests for the Assistant Inbox interaction invariant helper
// (no behavior change). collectActionControls gathers only interactive controls
// (button / [role=button] / radio / checkbox). assertNoSideEffectActionControls
// requires every button-like control to carry an allowed data-action-scope and
// every control's label (text + aria-label) to be free of side-effect action
// words — with deliberate carve-outs ("Runner" ≠ "run ", "Apply view" ≠ "apply
// patch", "external" is a noun, not an action). assertNoForbiddenActionText
// scans surface text against the narrower text-word list that excludes
// noun-collision words. The helper raises via vitest expect, so failures throw.
// Pure DOM, no network.

function root(...children: Element[]): HTMLElement {
  const div = document.createElement("div");
  for (const c of children) div.appendChild(c);
  return div;
}

function control(
  tag: string,
  opts: { text?: string; role?: string; scope?: string; ariaLabel?: string; type?: string } = {},
): HTMLElement {
  const el = document.createElement(tag);
  if (opts.text != null) el.textContent = opts.text;
  if (opts.role != null) el.setAttribute("role", opts.role);
  if (opts.scope != null) el.setAttribute("data-action-scope", opts.scope);
  if (opts.ariaLabel != null) el.setAttribute("aria-label", opts.ariaLabel);
  if (opts.type != null) (el as HTMLInputElement).type = opts.type;
  return el;
}

describe("collectActionControls", () => {
  it("collects only interactive controls and ignores plain elements", () => {
    const r = root(
      control("button", { text: "Apply view", scope: "local-view" }),
      control("div", { role: "button", text: "Open", scope: "local-detail" }),
      control("input", { type: "radio" }),
      control("input", { type: "checkbox" }),
      control("input", { type: "text" }),
      control("div", { text: "label only" }),
    );
    const found = collectActionControls(r);
    expect(found).toHaveLength(4);
  });
});

describe("assertNoSideEffectActionControls", () => {
  it("passes when button-like controls carry an allowed scope and labels are clean", () => {
    const r = root(
      control("button", { text: "Apply view", scope: "local-view" }),
      control("div", { role: "button", text: "Open detail", scope: "local-detail" }),
      control("input", { type: "radio", ariaLabel: "All sources" }),
    );
    expect(() => assertNoSideEffectActionControls(r)).not.toThrow();
  });

  it("throws when a button is missing or carries an unknown data-action-scope", () => {
    expect(() => assertNoSideEffectActionControls(root(control("button", { text: "Open" })))).toThrow();
    expect(() =>
      assertNoSideEffectActionControls(root(control("button", { text: "Open", scope: "global-send" }))),
    ).toThrow();
  });

  it("throws on a forbidden side-effect word in the label even with a valid scope", () => {
    const r = root(control("button", { text: "Approve", scope: "local-view" }));
    expect(() => assertNoSideEffectActionControls(r)).toThrow();
  });

  it("word-probes radios/checkboxes without requiring a scope", () => {
    expect(() =>
      assertNoSideEffectActionControls(root(control("input", { type: "radio", ariaLabel: "Send now" }))),
    ).toThrow();
    expect(() =>
      assertNoSideEffectActionControls(root(control("input", { type: "checkbox", ariaLabel: "Pinned only" }))),
    ).not.toThrow();
  });

  it("honors the carve-outs: Runner, Apply view, and External are not action words", () => {
    const r = root(
      control("button", { text: "Runner deck", scope: "local-view" }),
      control("button", { text: "Apply view", scope: "local-preference" }),
      control("button", { text: "External Source Deck", scope: "local-detail" }),
    );
    expect(() => assertNoSideEffectActionControls(r)).not.toThrow();
  });
});

describe("assertNoForbiddenActionText", () => {
  it("throws when surface text contains a forbidden text word", () => {
    const r = root(control("div", { text: "Approve the pending item" }));
    expect(() => assertNoForbiddenActionText(r)).toThrow();
  });

  it("passes on noun-collision words excluded from the text-word list", () => {
    const r = root(control("div", { text: "Load the External Source Deck and write notes" }));
    expect(() => assertNoForbiddenActionText(r)).not.toThrow();
  });
});

describe("invariant word lists", () => {
  it("pins the allowed scopes", () => {
    expect(ALLOWED_ACTION_SCOPES).toEqual(["local-view", "local-preference", "local-detail"]);
  });

  it("keeps the text list narrower than the action list (no noun-collision words)", () => {
    for (const w of FORBIDDEN_TEXT_WORDS) {
      expect(FORBIDDEN_ACTION_WORDS as readonly string[]).toContain(w);
    }
    for (const noun of ["load", "import", "write", "sync", "execute"]) {
      expect(FORBIDDEN_TEXT_WORDS as readonly string[]).not.toContain(noun);
    }
  });
});
