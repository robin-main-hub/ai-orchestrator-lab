// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  ALLOWED_ACTION_SCOPES,
  FORBIDDEN_ACTION_WORDS,
  assertNoForbiddenActionText,
  assertNoSideEffectActionControls,
  collectActionControls,
} from "./inboxInvariant";

// Batch 16 LINE E — lock the upgraded interaction invariant ("no side-effect
// action control") before any real button ships.

function host(html: string): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
}

describe("inboxInvariant — no side-effect action controls", () => {
  it("accepts a scoped local-view button", () => {
    const root = host('<button data-action-scope="local-view">Blocked</button>');
    expect(() => assertNoSideEffectActionControls(root)).not.toThrow();
  });

  it("accepts the role=button + radio surfaces (rows, filters)", () => {
    const root = host(
      '<div role="button" data-action-scope="local-detail">plugin alpha</div>' +
        '<label><input type="radio" />today</label>',
    );
    expect(() => assertNoSideEffectActionControls(root)).not.toThrow();
  });

  it("rejects a button with no data-action-scope", () => {
    const root = host("<button>Blocked</button>");
    expect(() => assertNoSideEffectActionControls(root)).toThrow();
  });

  it("rejects a bogus (non-local) scope", () => {
    const root = host('<button data-action-scope="server">Blocked</button>');
    expect(() => assertNoSideEffectActionControls(root)).toThrow();
  });

  it("rejects a forbidden side-effect word even when scoped", () => {
    const root = host('<button data-action-scope="local-view">Send</button>');
    expect(() => assertNoSideEffectActionControls(root)).toThrow();
  });

  it("does NOT false-positive on legitimate local labels (Runner, Apply view, External)", () => {
    const root = host(
      '<button data-action-scope="local-view">Runner</button>' +
        '<button data-action-scope="local-preference">Apply view</button>' +
        '<div role="button" data-action-scope="local-detail">external-source row</div>',
    );
    expect(() => assertNoSideEffectActionControls(root)).not.toThrow();
  });

  it("body-text scan catches a forbidden action verb but allows 'External Source Deck'", () => {
    expect(() => assertNoForbiddenActionText(host("<p>dispatch the runner</p>"))).toThrow();
    expect(() =>
      assertNoForbiddenActionText(host("<p>Source Dock · External Source Deck · read-only</p>")),
    ).not.toThrow();
  });

  it("collectActionControls finds every interactive control", () => {
    const root = host(
      '<button data-action-scope="local-view">a</button>' +
        '<div role="button" data-action-scope="local-detail">b</div>' +
        '<input type="radio" />',
    );
    expect(collectActionControls(root)).toHaveLength(3);
  });

  it("exports the vocabulary", () => {
    expect(ALLOWED_ACTION_SCOPES).toContain("local-view");
    expect(ALLOWED_ACTION_SCOPES).toContain("local-detail");
    expect([...FORBIDDEN_ACTION_WORDS]).not.toContain("external");
  });
});
