import { estimateTokens } from "./soulInjection.js";

/**
 * Lorebook / world-info engine — OPTIONAL, MULTI-TENANT.
 *
 * Keyword-triggered context entries (the SillyTavern "world info" concept):
 * when the scan text (mission goal, kickoff, conversation tail) mentions a
 * trigger key, the entry's content is injected alongside the persona identity.
 *
 * Two hard requirements, both first-class here:
 *  - OPTIONAL — nothing is injected unless the caller explicitly scans and
 *    passes the fragment in; books and entries also carry their own `enabled`
 *    flags. Off by default everywhere.
 *  - MULTI-TENANT — every book belongs to a tenant. A scan only sees books of
 *    the requested tenant plus the explicit "shared" tenant, so one deployment
 *    can host world-info for multiple companies without leakage.
 */

export const DEFAULT_LOREBOOK_TENANT = "default";
/** books in this tenant are visible to every tenant's scan */
export const SHARED_LOREBOOK_TENANT = "shared";

export type LorebookEntry = {
  id: string;
  /** trigger keywords; entry activates when any key appears in the scan text */
  keys: string[];
  content: string;
  enabled: boolean;
  /** lower inserts first */
  insertionOrder: number;
  /** match keys case-sensitively (default false) */
  caseSensitive?: boolean;
  /** always active regardless of keys (pinned lore) */
  constant?: boolean;
  comment?: string;
};

export type Lorebook = {
  id: string;
  name: string;
  /** owning tenant; "shared" books are visible to all tenants */
  tenantId: string;
  enabled: boolean;
  description?: string;
  entries: LorebookEntry[];
};

export type LorebookMatch = {
  bookId: string;
  bookName: string;
  entry: LorebookEntry;
  /** key that triggered the entry; undefined for constant entries */
  matchedKey?: string;
};

export type LorebookScanOptions = {
  /** tenant whose books to scan (default "default"); "shared" books always included */
  tenantId?: string;
  /** cap on injected entries (default 8) */
  maxEntries?: number;
  /** cap on total estimated tokens of injected content (default 800) */
  tokenBudget?: number;
  estimate?: (text: string) => number;
};

const DEFAULT_MAX_ENTRIES = 8;
const DEFAULT_TOKEN_BUDGET = 800;

function entryMatches(entry: LorebookEntry, scanText: string, scanLower: string): string | undefined {
  for (const key of entry.keys) {
    const trimmed = key.trim();
    if (!trimmed) continue;
    const found = entry.caseSensitive
      ? scanText.includes(trimmed)
      : scanLower.includes(trimmed.toLowerCase());
    if (found) return trimmed;
  }
  return undefined;
}

export function scanLorebooks(
  books: ReadonlyArray<Lorebook>,
  scanText: string,
  options?: LorebookScanOptions,
): LorebookMatch[] {
  const tenantId = options?.tenantId ?? DEFAULT_LOREBOOK_TENANT;
  const maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const tokenBudget = options?.tokenBudget ?? DEFAULT_TOKEN_BUDGET;
  const estimate = options?.estimate ?? estimateTokens;
  const scanLower = scanText.toLowerCase();

  const candidates: LorebookMatch[] = [];
  for (const book of books) {
    if (!book.enabled) continue;
    // tenant isolation: only the requested tenant's books + shared books
    if (book.tenantId !== tenantId && book.tenantId !== SHARED_LOREBOOK_TENANT) continue;
    for (const entry of book.entries) {
      if (!entry.enabled) continue;
      if (entry.constant) {
        candidates.push({ bookId: book.id, bookName: book.name, entry });
        continue;
      }
      const matchedKey = entryMatches(entry, scanText, scanLower);
      if (matchedKey !== undefined) {
        candidates.push({ bookId: book.id, bookName: book.name, entry, matchedKey });
      }
    }
  }

  candidates.sort((a, b) => a.entry.insertionOrder - b.entry.insertionOrder);

  const selected: LorebookMatch[] = [];
  let spentTokens = 0;
  for (const match of candidates) {
    if (selected.length >= maxEntries) break;
    const cost = estimate(match.entry.content);
    if (spentTokens + cost > tokenBudget) continue; // skip oversized, keep trying smaller ones
    spentTokens += cost;
    selected.push(match);
  }
  return selected;
}

/** Render matches as the injectable world-info block. Empty string when nothing matched. */
export function buildLorebookFragment(
  matches: ReadonlyArray<LorebookMatch>,
  options?: { headerLine?: string },
): string {
  if (matches.length === 0) return "";
  const header = options?.headerLine ?? "## World Info (lorebook)";
  const body = matches.map((match) => match.entry.content.trim()).join("\n\n");
  return `${header}\n${body}`;
}

// ─── SillyTavern character_book import ────────────────────────────────────

/** SillyTavern character card V2 embedded world book (data.character_book). */
export type CharacterBookEntry = {
  keys?: string[];
  content?: string;
  enabled?: boolean;
  insertion_order?: number;
  case_sensitive?: boolean;
  constant?: boolean;
  name?: string;
  comment?: string;
  id?: number;
};

export type CharacterBook = {
  name?: string;
  description?: string;
  entries?: CharacterBookEntry[];
};

export function characterBookToLorebook(
  book: CharacterBook,
  options: { id: string; tenantId?: string; name?: string },
): Lorebook {
  const entries: LorebookEntry[] = (book.entries ?? []).map((entry, index) => ({
    id: `${options.id}_e${entry.id ?? index}`,
    keys: (entry.keys ?? []).filter((key) => key.trim().length > 0),
    content: entry.content ?? "",
    enabled: entry.enabled ?? true,
    insertionOrder: entry.insertion_order ?? index,
    caseSensitive: entry.case_sensitive ?? false,
    constant: entry.constant ?? false,
    comment: entry.comment ?? entry.name,
  }));
  return {
    id: options.id,
    name: options.name ?? book.name ?? options.id,
    tenantId: options.tenantId ?? DEFAULT_LOREBOOK_TENANT,
    enabled: true,
    description: book.description,
    entries,
  };
}

/** Light structural check for lorebook JSON loaded from disk/bundle. */
export function isLorebook(value: unknown): value is Lorebook {
  if (typeof value !== "object" || value === null) return false;
  const book = value as Record<string, unknown>;
  return (
    typeof book.id === "string" &&
    typeof book.name === "string" &&
    typeof book.tenantId === "string" &&
    typeof book.enabled === "boolean" &&
    Array.isArray(book.entries)
  );
}
