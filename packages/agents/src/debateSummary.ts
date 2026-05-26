/**
 * Debate result summary utilities — issue #4.
 *
 * Provides:
 *   countTagDistribution  — aggregate agreement/objection/evidence/risk/
 *                           coding_impact counts across all utterances
 *   buildDebateSummary    — produce a human-readable markdown summary of a
 *                           completed (or in-progress) debate
 *
 * Pure functions over protocol data types — no LLM call, no side effects.
 */

import type { DebateRound, DebateTag, DebateUtterance } from "@ai-orchestrator/protocol";
import type { DebateContext } from "./index.js";

export type TagDistribution = Record<DebateTag, number>;

/** Count how many utterances carry each tag across any utterance set. */
export function countTagDistribution(utterances: DebateUtterance[]): TagDistribution {
  const dist: TagDistribution = {
    agreement: 0,
    objection: 0,
    evidence: 0,
    risk: 0,
    coding_impact: 0,
  };
  for (const u of utterances) {
    for (const tag of u.tags) {
      dist[tag] = (dist[tag] ?? 0) + 1;
    }
  }
  return dist;
}

export type DebateSummaryOptions = {
  /** Max utterances to quote per round. Default 3. */
  maxUtterancesPerRound?: number;
  /** Include tag distribution table. Default true. */
  includeTagDistribution?: boolean;
  /** Truncate utterance content to this length. Default 200. */
  utteranceTruncateLength?: number;
};

/**
 * Build a markdown summary of a debate from its context and round array.
 *
 * Only rounds with status "completed" or "running" contribute utterances.
 * Pending/blocked rounds appear as headings with a status note so the
 * reader can see where the debate stopped.
 */
export function buildDebateSummary(
  context: DebateContext,
  rounds: DebateRound[],
  options: DebateSummaryOptions = {},
): string {
  const {
    maxUtterancesPerRound = 3,
    includeTagDistribution = true,
    utteranceTruncateLength = 200,
  } = options;

  const allUtterances = rounds.flatMap((r) => r.utterances);
  const lines: string[] = [];

  lines.push("# 토론 요약");
  lines.push("");
  lines.push(`**문제:** ${context.problem}`);
  if (context.conversationSummary) {
    lines.push("");
    lines.push(`**배경:** ${context.conversationSummary}`);
  }
  lines.push("");

  if (includeTagDistribution && allUtterances.length > 0) {
    const dist = countTagDistribution(allUtterances);
    const total = allUtterances.length;
    lines.push("## 의견 분포");
    lines.push("");
    lines.push("| 태그 | 건수 | 비율 |");
    lines.push("|---|---:|---:|");
    for (const tag of ["agreement", "objection", "evidence", "risk", "coding_impact"] as DebateTag[]) {
      const count = dist[tag];
      if (count === 0) continue;
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
      lines.push(`| ${tag} | ${count} | ${pct}% |`);
    }
    lines.push("");
  }

  for (const round of rounds) {
    const isActive = round.status === "completed" || round.status === "running";
    lines.push(`## ${round.title} (${round.kind})`);
    if (!isActive) {
      lines.push(`*${round.status}*`);
      lines.push("");
      continue;
    }
    const shown = round.utterances.slice(0, maxUtterancesPerRound);
    for (const u of shown) {
      const tag = u.tags[0] ?? "evidence";
      lines.push(`- **[${tag}]** \`${u.agentId}\`: ${truncate(u.content, utteranceTruncateLength)}`);
    }
    const overflow = round.utterances.length - maxUtterancesPerRound;
    if (overflow > 0) {
      lines.push(`  *…외 ${overflow}건 생략*`);
    }
    if (round.utterances.length === 0) {
      lines.push("*발언 없음*");
    }
    lines.push("");
  }

  return lines.join("\n");
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
