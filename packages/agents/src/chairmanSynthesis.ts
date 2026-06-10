/**
 * Chairman synthesis for the debate — the "LLM Council" pattern: after the
 * members debate, a chairman consolidates their positions into one weighted
 * decision rather than a flat bucket of utterances.
 *
 * Deterministic and pure: it ranks agreement points by how many agents
 * accepted them (`acceptedBy`), separates contested points (accepted AND
 * rejected by different agents), collects rejections and risks, and derives a
 * confidence + consensus level from the accept/reject balance. The result can
 * be folded into a CodingPacket (`withChairmanSynthesis`) so the handoff leads
 * with the synthesized decision instead of unordered fragments.
 */

import type { CodingPacket, DebateRound, DebateTag } from "@ai-orchestrator/protocol";
import type { DebateContext } from "./index.js";

const TAG_MARKER_PATTERN = /\s*\[\[tag:(agreement|objection|evidence|risk|coding_impact)\]\]\s*$/i;

export type ChairmanAdoptedPoint = { point: string; support: number; by: string };
export type ChairmanContestedPoint = { point: string; for: number; against: number };
export type ConsensusLevel = "strong" | "moderate" | "split";

export type ChairmanDecision = {
  statement: string;
  adopted: ChairmanAdoptedPoint[];
  contested: ChairmanContestedPoint[];
  rejected: string[];
  risks: string[];
  /** 0..1 from the accept/reject balance across the council */
  confidence: number;
  consensusLevel: ConsensusLevel;
};

export type ChairmanSynthesisOptions = {
  /** cap items kept per list. default 6 */
  maxItems?: number;
  /** truncate each line. default 240 */
  truncateLength?: number;
};

function hasTag(tags: ReadonlyArray<DebateTag>, tag: DebateTag): boolean {
  return tags.includes(tag);
}

export function synthesizeChairmanDecision(
  context: DebateContext,
  rounds: DebateRound[],
  options: ChairmanSynthesisOptions = {},
): ChairmanDecision {
  const maxItems = options.maxItems ?? 6;
  const truncate = options.truncateLength ?? 240;

  const adopted: ChairmanAdoptedPoint[] = [];
  const contested: ChairmanContestedPoint[] = [];
  const rejected: string[] = [];
  const risks: string[] = [];
  let accepts = 0;
  let rejects = 0;

  for (const round of rounds) {
    if (round.status !== "completed" && round.status !== "running") continue;
    for (const utterance of round.utterances) {
      const point = clean(utterance.content, truncate);
      if (!point) continue;
      const forCount = utterance.acceptedBy?.length ?? 0;
      const againstCount = utterance.rejectedBy?.length ?? 0;
      accepts += forCount;
      rejects += againstCount;

      if (forCount > 0 && againstCount > 0) {
        contested.push({ point, for: forCount, against: againstCount });
        continue;
      }
      if (hasTag(utterance.tags, "objection") || againstCount > forCount) {
        rejected.push(point);
      } else if (hasTag(utterance.tags, "agreement") || forCount > 0) {
        adopted.push({ point, support: forCount, by: utterance.agentId });
      }
      if (hasTag(utterance.tags, "risk")) {
        risks.push(point);
      }
    }
  }

  adopted.sort((a, b) => b.support - a.support);
  const total = accepts + rejects;
  const confidence = total === 0 ? 0.5 : Math.round((accepts / total) * 100) / 100;
  const consensusLevel: ConsensusLevel = confidence >= 0.75 ? "strong" : confidence >= 0.5 ? "moderate" : "split";

  const statement = adopted[0]?.point ?? `${context.problem} — 합의 형성 필요 (chairman)`;

  return {
    statement,
    adopted: dedupeAdopted(adopted).slice(0, maxItems),
    contested: contested.slice(0, maxItems),
    rejected: dedupe(rejected).slice(0, maxItems),
    risks: dedupe(risks).slice(0, maxItems),
    confidence,
    consensusLevel,
  };
}

/** Render the chairman decision as reviewer-note lines for a CodingPacket. */
export function chairmanDecisionToNotes(decision: ChairmanDecision): string[] {
  const lines: string[] = [
    `[Chairman 종합] ${decision.statement}`,
    `합의 수준: ${decision.consensusLevel} (confidence ${decision.confidence.toFixed(2)})`,
  ];
  for (const point of decision.contested) {
    lines.push(`쟁점: ${point.point} (찬성 ${point.for} / 반대 ${point.against})`);
  }
  return lines;
}

/**
 * Fold a chairman decision into a packet as a synthesis layer on
 * `reviewerNotes` — the synthesized statement + consensus/confidence, the
 * adopted points ranked by support, the contested points, and the rejected
 * options. `decisions`/`rejectedOptions` (already bucketed by the extractor)
 * are left untouched so chairman enriches rather than double-counts. Returns a
 * new packet.
 */
export function withChairmanSynthesis(packet: CodingPacket, decision: ChairmanDecision): CodingPacket {
  const adoptedNotes = decision.adopted.map((point) => `채택(지지 ${point.support}): ${point.point}`);
  const rejectedNotes = decision.rejected.map((point) => `반려: ${point}`);
  return {
    ...packet,
    reviewerNotes: dedupe([
      ...chairmanDecisionToNotes(decision),
      ...adoptedNotes,
      ...rejectedNotes,
      ...packet.reviewerNotes,
    ]),
  };
}

function clean(content: string, max: number): string {
  const stripped = content.replace(TAG_MARKER_PATTERN, "").trim();
  return stripped.length <= max ? stripped : `${stripped.slice(0, max - 1)}…`;
}

function dedupe(list: string[]): string[] {
  return [...new Set(list.filter(Boolean))];
}

function dedupeAdopted(list: ChairmanAdoptedPoint[]): ChairmanAdoptedPoint[] {
  const seen = new Set<string>();
  const out: ChairmanAdoptedPoint[] = [];
  for (const item of list) {
    if (seen.has(item.point)) continue;
    seen.add(item.point);
    out.push(item);
  }
  return out;
}
