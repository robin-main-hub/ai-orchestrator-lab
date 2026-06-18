import { describe, expect, it } from "vitest";
import { INBOX_VOCAB, INBOX_VOCAB_VALUES } from "./inboxVocabulary";
import { FORBIDDEN_TEXT_WORDS } from "../components/inbox/inboxInvariant";

const FORBIDDEN_DOMAIN = ["giolite", "erp", "customer", "sales", "quotation", "buyer", "factory"];

describe("Batch 27 — inbox vocabulary (Launch Key / Commit Point UX)", () => {
  it("exposes a stable set of string labels", () => {
    expect(Object.keys(INBOX_VOCAB)).toEqual([
      "operatorConsole",
      "commandDeck",
      "controlQueue",
      "launchKey",
      "commitPoint",
      "readOnlyNote",
      "patchLaneCaption",
    ]);
    for (const v of INBOX_VOCAB_VALUES) {
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(0);
    }
  });

  it("adopts the launch-key / commit-point framing", () => {
    expect(INBOX_VOCAB.launchKey).toBe("launch key");
    expect(INBOX_VOCAB.commitPoint).toBe("commit point");
    expect(INBOX_VOCAB.patchLaneCaption).toContain("commit point");
  });

  it("the read-only note still conveys the no-execution protection", () => {
    expect(INBOX_VOCAB.readOnlyNote).toContain("read-only");
    // preserves the protection meaning (does not execute / commit here)
    expect(INBOX_VOCAB.readOnlyNote).toMatch(/실행|preview|미리보기/);
  });

  it("leaks no forbidden side-effect action word (labels are read-only framing)", () => {
    const blob = INBOX_VOCAB_VALUES.join(" ").toLowerCase();
    for (const w of FORBIDDEN_TEXT_WORDS) {
      expect(blob.includes(w), `vocab must not contain side-effect word "${w}"`).toBe(false);
    }
  });

  it("carries no domain vocabulary", () => {
    const blob = INBOX_VOCAB_VALUES.join(" ").toLowerCase();
    for (const term of FORBIDDEN_DOMAIN) expect(blob.includes(term)).toBe(false);
  });
});
