/**
 * Batch 24 LINE H — Evidence Draft / Footnote Surface.
 *
 * A generic "trustworthy assistant" draft layer. A DRAFT is a set of claims;
 * each claim is backed by numbered evidence FOOTNOTES that point at a source
 * ref. Every footnote carries a freshness verdict (fresh / aging / stale /
 * unknown) derived PURELY from an injected reference time — never Date.now, so
 * the projection is deterministic and testable. Claims with no backing evidence
 * are NOT silently asserted: they surface in a "missing info / ask" slot.
 *
 * Pure projection only — no execution, no external send, no I/O, no source
 * sync, no Date.now. Generic identifiers only (source-001 / entity-001 /
 * example-system). This composes the same evidence vocabulary the inbox already
 * uses (EvidenceRef-style refs) without duplicating the EvidenceCard surface;
 * the NEW surface is the draft-with-footnotes + freshness chips + ask slot.
 */

export type Freshness = "fresh" | "aging" | "stale" | "unknown";

/** Hours-from-now thresholds for the freshness verdict (boundaries inclusive-below). */
export const FRESHNESS_THRESHOLDS = { freshUnderHours: 24, agingUnderHours: 24 * 7 } as const;

/** A source reference the draft can footnote. observedAt absent → freshness "unknown". */
export type DraftSourceRef = {
  /** Stable id, e.g. "source-001". */
  id: string;
  /** Short human label (file path / tool / source name). */
  label: string;
  /** Optional locator detail (line range, fragment, …). */
  locator?: string;
  /** ISO timestamp the source was last observed. Absent → "unknown" freshness. */
  observedAt?: string;
};

/** A single draft claim plus the source-ref ids that back it (empty → missing-info). */
export type DraftClaimInput = {
  id: string;
  /** The claim sentence (generic copy only). */
  text: string;
  /** Source-ref ids backing this claim. Empty / all-unknown → surfaces as ask. */
  refs: ReadonlyArray<string>;
};

/** Raw, generic draft input — claims + a source-ref table. */
export type EvidenceDraftInput = {
  id: string;
  title: string;
  claims: ReadonlyArray<DraftClaimInput>;
  sources: ReadonlyArray<DraftSourceRef>;
};

/** A projected, numbered footnote with a computed freshness verdict. */
export type DraftFootnote = {
  /** 1-based footnote number (stable, by first appearance across claims). */
  n: number;
  refId: string;
  label: string;
  locator?: string;
  freshness: Freshness;
  /** Whole hours since observedAt (relative to the injected now); null if unknown. */
  ageHours: number | null;
};

/** A projected claim with the footnote numbers backing it. */
export type DraftClaim = {
  id: string;
  text: string;
  /** Footnote numbers backing this claim, in order. */
  footnotes: number[];
  /** True iff the claim has at least one resolved footnote. */
  supported: boolean;
};

/** A claim with no backing evidence — surfaced for the operator to attach a source. */
export type MissingInfo = {
  claimId: string;
  text: string;
  /** Generic, no-side-effect prompt (a placeholder, not a command). */
  ask: string;
};

export type EvidenceDraft = {
  id: string;
  title: string;
  claims: DraftClaim[];
  footnotes: DraftFootnote[];
  missing: MissingInfo[];
  /** Count of footnotes per freshness verdict. */
  freshnessSummary: Record<Freshness, number>;
  /** Convenience: number of stale footnotes (drives the warning chip). */
  staleCount: number;
};

/** Classify an age (in ms) into a freshness verdict. ms === null → "unknown". */
export function classifyFreshness(ageMs: number | null): Freshness {
  if (ageMs == null || Number.isNaN(ageMs)) return "unknown";
  if (ageMs < 0) return "fresh"; // future-stamped → treat as freshest, never stale
  const hours = ageMs / 3_600_000;
  if (hours < FRESHNESS_THRESHOLDS.freshUnderHours) return "fresh";
  if (hours < FRESHNESS_THRESHOLDS.agingUnderHours) return "aging";
  return "stale";
}

/**
 * Project a raw draft into a footnoted, freshness-scored, ask-aware draft.
 *
 * @param input  generic claims + source-ref table
 * @param nowMs  injected reference time (ms). REQUIRED — keeps the projection
 *               pure and deterministic; callers pass a fixed example time in
 *               PREVIEW and a real clock value at the call site if ever live.
 */
export function projectEvidenceDraft(input: EvidenceDraftInput, nowMs: number): EvidenceDraft {
  const sourceById = new Map(input.sources.map((s) => [s.id, s]));

  // Assign footnote numbers by first appearance across claims (deduped, known refs only).
  const footnoteNumberByRef = new Map<string, number>();
  const footnotes: DraftFootnote[] = [];
  for (const claim of input.claims) {
    for (const refId of claim.refs) {
      if (footnoteNumberByRef.has(refId)) continue;
      const src = sourceById.get(refId);
      if (!src) continue; // unknown ref → not a footnote (claim may fall to missing)
      const n = footnotes.length + 1;
      footnoteNumberByRef.set(refId, n);
      const observedMs = src.observedAt != null ? Date.parse(src.observedAt) : NaN;
      const ageMs = Number.isNaN(observedMs) ? null : nowMs - observedMs;
      footnotes.push({
        n,
        refId: src.id,
        label: src.label,
        locator: src.locator,
        freshness: classifyFreshness(ageMs),
        ageHours: ageMs == null ? null : Math.max(0, Math.round(ageMs / 3_600_000)),
      });
    }
  }

  const claims: DraftClaim[] = input.claims.map((c) => {
    const nums = c.refs
      .map((r) => footnoteNumberByRef.get(r))
      .filter((n): n is number => typeof n === "number");
    return { id: c.id, text: c.text, footnotes: nums, supported: nums.length > 0 };
  });

  const missing: MissingInfo[] = claims
    .filter((c) => !c.supported)
    .map((c) => ({
      claimId: c.id,
      text: c.text,
      ask: "no source yet — ask the operator to attach evidence",
    }));

  const freshnessSummary: Record<Freshness, number> = { fresh: 0, aging: 0, stale: 0, unknown: 0 };
  for (const f of footnotes) freshnessSummary[f.freshness] += 1;

  return {
    id: input.id,
    title: input.title,
    claims,
    footnotes,
    missing,
    freshnessSummary,
    staleCount: freshnessSummary.stale,
  };
}

/** Fixed reference time for the PREVIEW example so freshness is deterministic. */
export const EXAMPLE_DRAFT_NOW_MS = Date.parse("2026-06-18T12:00:00.000Z");

/**
 * Generic example draft. One fresh, one aging + one stale, one unknown footnote,
 * and one unbacked claim that falls into the ask slot — so the PREVIEW card
 * exercises every freshness verdict and the missing-info path. Generic only.
 */
export const EXAMPLE_EVIDENCE_DRAFT: EvidenceDraftInput = {
  id: "draft-001",
  title: "example-system status draft",
  sources: [
    {
      id: "source-001",
      label: "example-system build log",
      locator: "exit 0",
      observedAt: "2026-06-18T11:00:00.000Z", // 1h → fresh
    },
    {
      id: "source-002",
      label: "entity-001 lint report",
      locator: "3 notes",
      observedAt: "2026-06-16T12:00:00.000Z", // 48h → aging
    },
    {
      id: "source-003",
      label: "example-system prior check",
      observedAt: "2026-06-01T12:00:00.000Z", // ~408h → stale
    },
    {
      id: "source-004",
      label: "runner gate snapshot",
      // no observedAt → unknown freshness
    },
  ],
  claims: [
    {
      id: "claim-1",
      text: "example-system build observed clean",
      refs: ["source-001"],
    },
    {
      id: "claim-2",
      text: "entity-001 lint drift recorded, matching a prior check",
      refs: ["source-002", "source-003"],
    },
    {
      id: "claim-3",
      text: "runner gate status is reported but its freshness is unconfirmed",
      refs: ["source-004"],
    },
    {
      id: "claim-4",
      text: "downstream impact has not yet been assessed",
      refs: [], // unbacked → ask slot
    },
  ],
};
