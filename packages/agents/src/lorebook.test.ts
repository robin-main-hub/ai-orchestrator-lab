import { describe, expect, it } from "vitest";
import {
  buildLorebookFragment,
  characterBookToLorebook,
  isLorebook,
  scanLorebooks,
  SHARED_LOREBOOK_TENANT,
  type Lorebook,
  type LorebookEntry,
} from "./lorebook.js";

const entry = (over: Partial<LorebookEntry> = {}): LorebookEntry => ({
  id: over.id ?? "e1",
  keys: over.keys ?? ["DGX"],
  content: over.content ?? "DGX-01은 절대 건드리지 않는다.",
  enabled: over.enabled ?? true,
  insertionOrder: over.insertionOrder ?? 0,
  caseSensitive: over.caseSensitive,
  constant: over.constant,
  comment: over.comment,
});

const book = (over: Partial<Lorebook> = {}): Lorebook => ({
  id: over.id ?? "b1",
  name: over.name ?? "Core",
  tenantId: over.tenantId ?? "default",
  enabled: over.enabled ?? true,
  entries: over.entries ?? [entry()],
  description: over.description,
});

describe("scanLorebooks", () => {
  it("activates an entry when a key appears in the scan text (case-insensitive by default)", () => {
    const matches = scanLorebooks([book()], "dgx 서버에 배포해줘");
    expect(matches).toHaveLength(1);
    expect(matches[0]!.matchedKey).toBe("DGX");
  });

  it("misses when no key appears; case-sensitive keys respect case", () => {
    expect(scanLorebooks([book()], "맥미니에 배포")).toHaveLength(0);
    const sensitive = book({ entries: [entry({ caseSensitive: true })] });
    expect(scanLorebooks([sensitive], "dgx 배포")).toHaveLength(0);
    expect(scanLorebooks([sensitive], "DGX 배포")).toHaveLength(1);
  });

  it("constant entries are always active without a key", () => {
    const pinned = book({ entries: [entry({ constant: true, keys: [] })] });
    const matches = scanLorebooks([pinned], "아무 관련 없는 텍스트");
    expect(matches).toHaveLength(1);
    expect(matches[0]!.matchedKey).toBeUndefined();
  });

  it("MULTI-TENANT: a tenant only sees its own books plus shared books", () => {
    const books = [
      book({ id: "acme", tenantId: "acme", entries: [entry({ id: "a", content: "ACME 전용" })] }),
      book({ id: "umbrella", tenantId: "umbrella", entries: [entry({ id: "u", content: "Umbrella 전용" })] }),
      book({ id: "common", tenantId: SHARED_LOREBOOK_TENANT, entries: [entry({ id: "s", content: "공용 규칙" })] }),
    ];
    const acme = scanLorebooks(books, "DGX 점검", { tenantId: "acme" });
    expect(acme.map((m) => m.bookId).sort()).toEqual(["acme", "common"]);
    expect(acme.some((m) => m.entry.content.includes("Umbrella"))).toBe(false);
  });

  it("OPTIONAL: disabled books and disabled entries never inject", () => {
    expect(scanLorebooks([book({ enabled: false })], "DGX")).toHaveLength(0);
    expect(scanLorebooks([book({ entries: [entry({ enabled: false })] })], "DGX")).toHaveLength(0);
  });

  it("respects insertion order, max entries, and the token budget", () => {
    const entries = [
      entry({ id: "late", insertionOrder: 5, content: "나중" }),
      entry({ id: "first", insertionOrder: 1, content: "먼저" }),
      entry({ id: "huge", insertionOrder: 2, content: "x".repeat(10_000) }),
    ];
    const matches = scanLorebooks([book({ entries })], "DGX", { tokenBudget: 50 });
    // ordered by insertionOrder; the oversized entry is skipped, smaller ones still fit
    expect(matches.map((m) => m.entry.id)).toEqual(["first", "late"]);

    const capped = scanLorebooks([book({ entries })], "DGX", { maxEntries: 1, tokenBudget: 10_000 });
    expect(capped.map((m) => m.entry.id)).toEqual(["first"]);
  });
});

describe("buildLorebookFragment", () => {
  it("renders matched content under the world-info header, empty when nothing matched", () => {
    expect(buildLorebookFragment([])).toBe("");
    const fragment = buildLorebookFragment(scanLorebooks([book()], "DGX 점검"));
    expect(fragment).toContain("## World Info (lorebook)");
    expect(fragment).toContain("DGX-01은 절대 건드리지 않는다.");
  });
});

describe("characterBookToLorebook", () => {
  it("imports a SillyTavern character_book with defaults filled in", () => {
    const imported = characterBookToLorebook(
      {
        name: "Kurumi World",
        entries: [
          { keys: ["時崎", "쿠루미"], content: "정령. 시간을 다룬다.", insertion_order: 3 },
          { keys: [""], content: "빈 키 제거 확인", enabled: false },
        ],
      },
      { id: "kurumi_world", tenantId: "default" },
    );
    expect(isLorebook(imported)).toBe(true);
    expect(imported.name).toBe("Kurumi World");
    expect(imported.entries[0]).toMatchObject({
      keys: ["時崎", "쿠루미"],
      insertionOrder: 3,
      enabled: true,
      constant: false,
    });
    expect(imported.entries[1]!.keys).toEqual([]);
    expect(imported.entries[1]!.enabled).toBe(false);
  });
});

describe("isLorebook", () => {
  it("accepts the structural shape and rejects junk", () => {
    expect(isLorebook(book())).toBe(true);
    expect(isLorebook({ id: "x" })).toBe(false);
    expect(isLorebook(null)).toBe(false);
    expect(isLorebook("book")).toBe(false);
  });
});
