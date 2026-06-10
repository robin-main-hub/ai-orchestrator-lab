import type { DebateRound, DebateRoundKind, DebateTag } from "@ai-orchestrator/protocol";

/**
 * Project a debate into a visual-novel "battle" script: each utterance becomes
 * a VN line with a speaker, text, and an effect — `counter` for an objection
 * (반론 카운터 연출), `finish` for the final-decision round (결정 FINISH 연출),
 * `normal` otherwise. Pure, so it is unit-tested; the view resolves speakers to
 * display names / portraits.
 */

export type VnEffect = "normal" | "counter" | "finish";

export type VnLine = {
  speaker: string;
  text: string;
  effect: VnEffect;
  roundKind: DebateRoundKind;
};

const TAG_MARKER_PATTERN = /\s*\[\[tag:(agreement|objection|evidence|risk|coding_impact)\]\]\s*$/i;

function hasTag(tags: ReadonlyArray<DebateTag>, tag: DebateTag): boolean {
  return tags.includes(tag);
}

export function buildDebateVnScript(
  rounds: DebateRound[],
  options: { maxLines?: number; truncate?: number } = {},
): VnLine[] {
  const maxLines = options.maxLines ?? 60;
  const truncate = options.truncate ?? 280;
  const lines: VnLine[] = [];

  for (const round of rounds) {
    if (round.status !== "completed" && round.status !== "running") continue;
    for (const utterance of round.utterances) {
      const text = clean(utterance.content, truncate);
      if (!text) continue;
      const effect: VnEffect = hasTag(utterance.tags, "objection")
        ? "counter"
        : round.kind === "final_decision"
          ? "finish"
          : "normal";
      lines.push({ speaker: utterance.agentId, text, effect, roundKind: round.kind });
      if (lines.length >= maxLines) return lines;
    }
  }
  return lines;
}

/** The climactic finish line, if any (last `finish`-effect line). */
export function finishLine(lines: VnLine[]): VnLine | undefined {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index]!.effect === "finish") return lines[index];
  }
  return undefined;
}

function clean(content: string, max: number): string {
  const stripped = content.replace(TAG_MARKER_PATTERN, "").trim();
  return stripped.length <= max ? stripped : `${stripped.slice(0, max - 1)}…`;
}
