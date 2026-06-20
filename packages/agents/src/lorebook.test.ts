import { describe, expect, it } from "vitest";
import {
  buildLorebookFragment,
  characterBookToLorebook,
  DEFAULT_LOREBOOK_TENANT,
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

// The MULTI-TENANT test above always passes an explicit { tenantId }. The
// isolation that matters most for leakage is the *fallback* path: when a
// caller omits tenantId entirely, scanLorebooks falls back to
// DEFAULT_LOREBOOK_TENANT — and that fallback must NOT become a wildcard that
// sees every tenant's books. DEFAULT_LOREBOOK_TENANT is 0-ref across the test
// tree, so we pin its value as a tripwire and its fallback isolation here.
describe("scanLorebooks — default tenant fallback (DEFAULT_LOREBOOK_TENANT)", () => {
  it("pins the default tenant id and matches the book factory's own default", () => {
    expect(DEFAULT_LOREBOOK_TENANT).toBe("default");
    // self-consistency: a book created with no tenant override lives in the default tenant
    expect(book().tenantId).toBe(DEFAULT_LOREBOOK_TENANT);
  });

  it("when tenantId is omitted, sees only DEFAULT_LOREBOOK_TENANT + shared books — never another tenant's (no leakage on the fallback path)", () => {
    const books = [
      book({ id: "mine", tenantId: DEFAULT_LOREBOOK_TENANT, entries: [entry({ id: "d", content: "기본 테넌트" })] }),
      book({ id: "other", tenantId: "acme", entries: [entry({ id: "o", content: "ACME 전용" })] }),
      book({ id: "common", tenantId: SHARED_LOREBOOK_TENANT, entries: [entry({ id: "s", content: "공용 규칙" })] }),
    ];
    const matches = scanLorebooks(books, "DGX 점검");
    expect(matches.map((m) => m.bookId).sort()).toEqual(["common", "mine"]);
    expect(matches.some((m) => m.entry.content.includes("ACME"))).toBe(false);
  });

  it("the fallback is the default tenant specifically — an explicit non-default tenant cannot see default-tenant books", () => {
    const books = [
      book({ id: "mine", tenantId: DEFAULT_LOREBOOK_TENANT, entries: [entry({ id: "d", content: "기본 테넌트" })] }),
    ];
    // explicit other-tenant scan sees nothing of the default tenant
    expect(scanLorebooks(books, "DGX", { tenantId: "acme" })).toHaveLength(0);
    // omitted tenant (fallback) does see it
    expect(scanLorebooks(books, "DGX").map((m) => m.bookId)).toEqual(["mine"]);
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

// Four branches stay unpinned and the first is a real leakage tripwire: in JS
// "".includes("") === true, so a whitespace-only key would become a WILDCARD
// matching every scan text if entryMatches' `if (!trimmed) continue` guard ever
// regressed. SHARED_LOREBOOK_TENANT is 0-ref-pinned-value (only DEFAULT was
// pinned as a tripwire), buildLorebookFragment's custom headerLine + multi-match
// trim/join is untested, and characterBookToLorebook's undefined-entries / name-
// override / numeric-id / comment-fallback branches are uncovered. Pin them,
// self-consistent (derived from the entry/book/import inputs).
describe("lorebook — blank-key non-wildcard + shared-tenant pin + render/import edges", () => {
  it("a whitespace-only key never becomes a wildcard (empty-string includes guard)", () => {
    const blank = book({ entries: [entry({ keys: ["   "], constant: false })] });
    // non-empty scan text must NOT activate an entry whose only key is blank
    expect(scanLorebooks([blank], "아무 텍스트나 들어있다")).toHaveLength(0);
    // ...but a constant entry with blank keys still activates (constant bypasses key match)
    const pinnedBlank = book({ entries: [entry({ keys: ["   "], constant: true })] });
    expect(scanLorebooks([pinnedBlank], "아무 텍스트나 들어있다")).toHaveLength(1);
  });

  it("pins SHARED_LOREBOOK_TENANT and confirms a shared book reaches an explicit non-default tenant", () => {
    expect(SHARED_LOREBOOK_TENANT).toBe("shared");
    const shared = book({
      id: "common",
      tenantId: SHARED_LOREBOOK_TENANT,
      entries: [entry({ id: "s", constant: true, keys: [], content: "공용 규칙" })],
    });
    // a shared (constant) book is visible to every tenant — default AND an explicit other tenant
    expect(scanLorebooks([shared], "무관 텍스트").map((m) => m.bookId)).toEqual(["common"]);
    expect(scanLorebooks([shared], "무관 텍스트", { tenantId: "acme" }).map((m) => m.bookId)).toEqual(["common"]);
  });

  it("buildLorebookFragment honors a custom headerLine and trims+joins multiple matches", () => {
    const two = book({
      entries: [
        entry({ id: "one", insertionOrder: 0, content: "lore one\n\n\n", keys: ["DGX"] }),
        entry({ id: "two", insertionOrder: 1, content: "  lore two  ", keys: ["DGX"] }),
      ],
    });
    const fragment = buildLorebookFragment(scanLorebooks([two], "DGX 점검"), { headerLine: "# Custom World" });
    // custom header replaces the default, each content trimmed, joined by a blank line
    expect(fragment).toBe("# Custom World\nlore one\n\nlore two");
  });

  it("characterBookToLorebook: undefined entries → [], name/id/comment fallbacks fill in", () => {
    // no entries key at all → empty entries; name falls back to options.id (no book.name)
    const empty = characterBookToLorebook({}, { id: "empty_book" });
    expect(empty.entries).toEqual([]);
    expect(empty.name).toBe("empty_book"); // options.name ?? book.name ?? options.id
    expect(empty.tenantId).toBe(DEFAULT_LOREBOOK_TENANT); // tenant omitted → default
    expect(empty.description).toBeUndefined();

    // explicit options.name wins over book.name; numeric entry.id → `_e<id>`; comment ?? name
    const imported = characterBookToLorebook(
      { name: "BookName", entries: [{ keys: ["k"], content: "c", id: 42, name: "EntryName" }] },
      { id: "bk", name: "Override" },
    );
    expect(imported.name).toBe("Override");
    expect(imported.entries[0]!.id).toBe("bk_e42"); // numeric id, not index
    expect(imported.entries[0]!.comment).toBe("EntryName"); // comment ?? name fallback
    expect(imported.entries[0]!.insertionOrder).toBe(0); // insertion_order ?? index
    expect(imported.entries[0]!.caseSensitive).toBe(false); // default
  });
});
