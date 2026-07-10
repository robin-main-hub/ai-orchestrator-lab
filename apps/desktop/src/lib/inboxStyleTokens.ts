/**
 * Batch 26 LINE K — shared Assistant Inbox style tokens (Visual Style Pass).
 *
 * A single source of truth for the inbox's command-center look: the semantic
 * tone scale (good / warn / bad / info / neutral / muted) plus the chip / pill /
 * empty-state / section layout tokens. Previously the same
 * emerald/amber/rose "pass/warn/blocked" triple was copy-pasted across
 * FRESHNESS_TONE, SANDBOX_OUTCOME_TONE, HEALTH_TONE, SAFETY_TONE and several
 * inline spans — this module dedupes them so every status chip reads identically.
 *
 * Pure presentation strings only — no logic, no side effect, no domain terms.
 */

/** Semantic tone scale → Tailwind class string (border + bg + text). */
export const TONE = {
  /** healthy / pass / fresh / connected */
  good: "border border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  /** caution / warning / aging / stale-source */
  warn: "border border-amber-400/30 bg-amber-400/10 text-amber-200",
  /** blocked / error / stale */
  bad: "border border-rose-400/30 bg-rose-400/10 text-rose-200",
  /** informational accent — single-accent rule (§1.1): the old cyan is retired
   * to a neutral-bright tone so emerald stays the sole accent. */
  info: "border border-white/12 bg-white/[0.04] text-foreground",
  /** default chip tone (status strip) */
  neutral: "border border-white/10 bg-white/[0.03] text-muted-foreground",
  /** unknown / not-yet-observed */
  muted: "border border-white/15 bg-white/[0.04] text-muted-foreground/70",
} as const;

export type StyleTone = keyof typeof TONE;

/** All tone keys (stable order) — handy for tests + iteration. */
export const STYLE_TONES = Object.keys(TONE) as StyleTone[];

/** Resolve a tone to its class string. */
export function toneClass(tone: StyleTone): string {
  return TONE[tone];
}

/** Chip layout (combine with a TONE for color): the status-strip / count chip. */
export const CHIP_BASE = "inline-flex items-center rounded px-1.5 py-0.5 text-[12px] font-medium";

/** Small uppercase pill layout (kind / category / capability tags). */
export const PILL_BASE = "rounded px-1 text-[12px] uppercase tracking-wide";

/** A full chip = layout + tone. Default tone is neutral (the plain status chip). */
export function chipClass(tone: StyleTone = "neutral"): string {
  return `${CHIP_BASE} ${TONE[tone]}`;
}

/** A full pill = layout + tone. */
export function pillClass(tone: StyleTone = "muted"): string {
  return `${PILL_BASE} ${TONE[tone]}`;
}

/**
 * Compact dashed "ghost" container for an intentional empty state — reads as
 * "waiting", not "broken". Used by the section empty slot + card empty slots.
 */
export const EMPTY_STATE = "rounded-md border border-dashed border-white/10 bg-white/[0.012] px-2.5 py-2";

/** Section card shell + header typography (consistent hierarchy across cards). */
export const SECTION_CARD = "space-y-1.5 rounded-lg border border-white/5 bg-white/[0.02] p-2";
export const SECTION_HEADER = "text-[12px] font-semibold uppercase tracking-wider text-muted-foreground";
