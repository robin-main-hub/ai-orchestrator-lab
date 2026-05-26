/**
 * Derive a CodingPacket from a completed debate.
 *
 * The existing `createCodingPacketDraft(context)` returns hard-coded
 * placeholders. Once a debate actually runs, the utterances carry the
 * real signal: agreements, objections, risks, etc. This module walks
 * the completed/running rounds and buckets utterances by tag into the
 * matching CodingPacket field.
 *
 * Tag → field mapping (see `DebateTag`):
 *   - agreement    → decisions
 *   - objection    → rejectedOptions
 *   - evidence     → context
 *   - risk         → reviewerNotes
 *   - coding_impact → implementationPlan
 *
 * Filenames and constraint/goal/verificationPlan are seeded from
 * `DebateContext` since the engine output does not yet structurally
 * carry them. Callers should run the result through
 * `assertSafeCodingPacket` from `./index.js` before handing off.
 */

import type { CodingPacket, DebateRound, DebateTag } from "@ai-orchestrator/protocol";

import type { DebateContext } from "./index.js";

export type ExtractCodingPacketOptions = {
  /** Cap utterances pulled into each tag-driven field. Default 8. */
  maxItemsPerField?: number;
  /** Truncate each extracted line to this length. Default 240. */
  utteranceTruncateLength?: number;
};

const DEFAULT_MAX_PER_FIELD = 8;
const DEFAULT_TRUNCATE = 240;
const TAG_MARKER_PATTERN = /\s*\[\[tag:(agreement|objection|evidence|risk|coding_impact)\]\]\s*$/i;

const FIELD_FOR_TAG: Record<DebateTag, keyof CodingPacket> = {
  agreement: "decisions",
  objection: "rejectedOptions",
  evidence: "context",
  risk: "reviewerNotes",
  coding_impact: "implementationPlan",
};

/**
 * Walk the rounds, bucket utterances by tag into the matching
 * CodingPacket field. Pending / blocked rounds are skipped.
 * Pinned context, constraints, filenames, and verificationPlan come
 * from `DebateContext` since the engine does not emit them yet.
 */
export function extractCodingPacketFromDebate(
  context: DebateContext,
  rounds: DebateRound[],
  options: ExtractCodingPacketOptions = {},
): CodingPacket {
  const maxItems = options.maxItemsPerField ?? DEFAULT_MAX_PER_FIELD;
  const truncate = options.utteranceTruncateLength ?? DEFAULT_TRUNCATE;

  const buckets: Record<keyof CodingPacket, string[]> = {
    goal: [],
    context: [],
    decisions: [],
    rejectedOptions: [],
    constraints: [],
    filesToInspect: [],
    implementationPlan: [],
    verificationPlan: [],
    reviewerNotes: [],
  };

  // Seed context + constraints + reviewerNotes from DebateContext.
  if (context.conversationSummary) buckets.context.push(context.conversationSummary);
  for (const pref of context.userPreferences) buckets.context.push(`사용자 선호: ${pref}`);
  for (const c of context.constraints) buckets.constraints.push(c);
  for (const q of context.openQuestions) buckets.reviewerNotes.push(`미결 질문: ${q}`);

  // Walk completed/running rounds; ignore pending/blocked.
  for (const round of rounds) {
    if (round.status !== "completed" && round.status !== "running") continue;
    for (const u of round.utterances) {
      for (const tag of u.tags) {
        const field = FIELD_FOR_TAG[tag];
        if (!field) continue;
        const cleaned = stripTagMarker(u.content).trim();
        if (!cleaned) continue;
        const line = `(${u.agentId}) ${truncateText(cleaned, truncate)}`;
        const list = buckets[field] as string[];
        if (list.length < maxItems && !list.includes(line)) {
          list.push(line);
        }
      }
    }
  }

  return {
    goal: context.problem,
    context: buckets.context,
    decisions: buckets.decisions,
    rejectedOptions: buckets.rejectedOptions,
    constraints: buckets.constraints,
    filesToInspect: [],
    implementationPlan: buckets.implementationPlan,
    verificationPlan: [],
    reviewerNotes: buckets.reviewerNotes,
  };
}

function stripTagMarker(content: string): string {
  return content.replace(TAG_MARKER_PATTERN, "");
}

function truncateText(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}
