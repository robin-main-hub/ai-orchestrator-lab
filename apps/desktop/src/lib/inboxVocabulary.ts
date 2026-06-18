/**
 * Batch 27 LINE I — centralized Assistant Inbox vocabulary (Launch Key / Commit
 * Point UX). LABELS ONLY — this module changes wording, never behavior.
 *
 * The inbox is a READ-ONLY operator console. This is the single source of its
 * user-facing copy so the "command desk" framing stays consistent and testable.
 * It deliberately frames a reviewable change as something the operator INSPECTS
 * — a "commit point" / "launch key" — never as an action the inbox performs.
 * The inbox executes ZERO side effects.
 *
 * SAFETY NOTE (important): the genuine approval gates that protect real external
 * / irreversible actions live in OTHER surfaces (coding workbench, github
 * publish, autonomy run, control-queue drawer). Those are NOT renamed here —
 * relabelling a real protection gate as a casual "launch key" would be unsafe.
 * This vocabulary applies only to the read-only inbox command center.
 */
export const INBOX_VOCAB = {
  /** the inbox surface framing */
  operatorConsole: "Operator Console",
  commandDeck: "Command Deck",
  controlQueue: "Control Queue",
  /** a read-only candidate the operator inspects — the inbox never fires it */
  launchKey: "launch key",
  commitPoint: "commit point",
  /**
   * Standard read-only protection note. Preserves the original meaning ("this
   * surface performs no execution") while adopting the commit-point vocabulary
   * in place of the older "승인"(approval) wording.
   */
  readOnlyNote: "read-only · 미리보기 전용 · 실행·커밋 없음",
  /** patch candidate lane caption (read-only, preview-only) */
  patchLaneCaption: "Patch Candidate Lane · commit points to inspect · read-only · preview only",
} as const;

export type InboxVocabKey = keyof typeof INBOX_VOCAB;

/** All vocab values as one array — handy for invariant scans in tests. */
export const INBOX_VOCAB_VALUES = Object.values(INBOX_VOCAB) as string[];
