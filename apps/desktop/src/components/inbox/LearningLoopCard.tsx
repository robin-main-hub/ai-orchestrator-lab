import { Repeat, ChevronRight, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader } from "../ui/card";
import { Badge } from "../ui/badge";
import { StatusBadge } from "./StatusBadge";

/**
 * LINE F / N — Learning loop card.
 *
 * Read-only, presentational. Renders a learning loop's stage and where
 * it sits on the progression:
 *   failed → investigating → hypothesis_recorded → verified → distilled → consulted
 * with `rejected` as a terminal (off-track) stage. No actions.
 *
 * LINE N adds command-center density: a unified status badge (PASS/WARNING/
 * BLOCKED kind) plus compact, scannable fidelity counters (hypotheses /
 * verified / rejected) projected from the real loop record. No paragraphs.
 */

export type LearningLoopStage =
  | "failed"
  | "investigating"
  | "hypothesis_recorded"
  | "verified"
  | "distilled"
  | "consulted"
  | "rejected";

export type LearningLoopItem = {
  id: string;
  /** Short title — what this loop is about. */
  title: string;
  stage: LearningLoopStage;
  /** Optional compact note. */
  note?: string;
  /** LINE O fidelity — recorded hypotheses count (real loop record). */
  hypothesisCount?: number;
  /** LINE O fidelity — verified hypotheses count. */
  verifiedCount?: number;
  /** LINE O fidelity — rejected hypotheses count. */
  rejectedCount?: number;
};

/** Happy-path progression (rejected is terminal, off this track). */
export const LEARNING_LOOP_PROGRESSION: ReadonlyArray<
  Exclude<LearningLoopStage, "rejected">
> = ["failed", "investigating", "hypothesis_recorded", "verified", "distilled", "consulted"];

const STAGE_LABEL: Record<LearningLoopStage, string> = {
  failed: "failed",
  investigating: "investigating",
  hypothesis_recorded: "hypothesis",
  verified: "verified",
  distilled: "distilled",
  consulted: "consulted",
  rejected: "rejected",
};

/** Map a loop stage to a unified PASS/WARNING/BLOCKED status kind. */
function stageStatus(stage: LearningLoopStage) {
  if (stage === "rejected" || stage === "failed") return "blocked" as const;
  if (stage === "verified" || stage === "distilled" || stage === "consulted")
    return "pass" as const;
  return "warning" as const;
}

export function LearningLoopCard({ item }: { item: LearningLoopItem }) {
  const terminalRejected = item.stage === "rejected";
  const activeIndex = LEARNING_LOOP_PROGRESSION.indexOf(
    item.stage as Exclude<LearningLoopStage, "rejected">,
  );
  const hyp = item.hypothesisCount ?? 0;
  const ver = item.verifiedCount ?? 0;
  const rej = item.rejectedCount ?? 0;
  const hasCounters = hyp + ver + rej > 0;
  return (
    <Card
      className="gap-1.5 border-white/10 bg-white/[0.02] py-2.5"
      data-testid={`learning-loop-card-${item.id}`}
      data-stage={item.stage}
      data-terminal={terminalRejected ? "rejected" : "active"}
    >
      <CardHeader className="px-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Repeat className="h-3.5 w-3.5 text-primary/80" />
          <span className="truncate text-sm font-semibold">{item.title}</span>
          <StatusBadge
            kind={stageStatus(item.stage)}
            label={STAGE_LABEL[item.stage]}
            data-testid={`learning-loop-stage-${item.id}`}
            data-stage={item.stage}
          />
          {hasCounters ? (
            <span
              className="ml-auto inline-flex items-center gap-1.5 font-mono text-[12px] text-muted-foreground"
              data-testid={`learning-loop-counters-${item.id}`}
              data-hypotheses={hyp}
              data-verified={ver}
              data-rejected={rej}
            >
              <span title="hypotheses">H{hyp}</span>
              <span className="inline-flex items-center text-emerald-300/80" title="verified">
                <Check className="h-3 w-3" />
                {ver}
              </span>
              <span className="inline-flex items-center text-rose-300/80" title="rejected">
                <X className="h-3 w-3" />
                {rej}
              </span>
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="px-3">
        <ol
          className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[12px]"
          data-testid={`learning-loop-progression-${item.id}`}
        >
          {LEARNING_LOOP_PROGRESSION.map((stage, idx) => {
            const state =
              idx < activeIndex ? "done" : idx === activeIndex ? "current" : "pending";
            return (
              <li
                key={stage}
                className="inline-flex items-center gap-1"
                data-testid={`learning-loop-step-${item.id}-${stage}`}
                data-state={state}
              >
                {idx > 0 ? <ChevronRight className="h-2.5 w-2.5 opacity-60" /> : null}
                <span
                  className={
                    state === "current"
                      ? "font-semibold text-foreground"
                      : state === "done"
                        ? "text-foreground/70"
                        : "text-muted-foreground/50"
                  }
                >
                  {STAGE_LABEL[stage]}
                </span>
              </li>
            );
          })}
        </ol>
        {terminalRejected ? (
          <p
            className="mt-1 text-[12px] text-rose-300/80"
            data-testid={`learning-loop-rejected-${item.id}`}
          >
            rejected · off the verification track
          </p>
        ) : null}
        {item.note ? (
          <p className="mt-1 text-xs text-muted-foreground" data-testid={`learning-loop-note-${item.id}`}>
            {item.note}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
