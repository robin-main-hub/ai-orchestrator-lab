import { Repeat, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader } from "../ui/card";
import { Badge } from "../ui/badge";

/**
 * LINE F — Learning loop card.
 *
 * Read-only, presentational. Renders a learning loop's stage and where
 * it sits on the progression:
 *   failed → investigating → hypothesis_recorded → verified → distilled → consulted
 * with `rejected` as a terminal (off-track) stage. No actions.
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

function stageVariant(stage: LearningLoopStage) {
  if (stage === "rejected" || stage === "failed") return "destructive" as const;
  if (stage === "verified" || stage === "distilled" || stage === "consulted")
    return "default" as const;
  return "outline" as const;
}

export function LearningLoopCard({ item }: { item: LearningLoopItem }) {
  const terminalRejected = item.stage === "rejected";
  const activeIndex = LEARNING_LOOP_PROGRESSION.indexOf(
    item.stage as Exclude<LearningLoopStage, "rejected">,
  );
  return (
    <Card
      className="gap-2 border-white/10 bg-white/[0.02] py-3"
      data-testid={`learning-loop-card-${item.id}`}
      data-stage={item.stage}
      data-terminal={terminalRejected ? "rejected" : "active"}
    >
      <CardHeader className="px-3">
        <div className="flex flex-wrap items-center gap-2">
          <Repeat className="h-3.5 w-3.5 text-violet-300/80" />
          <span className="text-sm font-semibold">{item.title}</span>
          <Badge
            variant={stageVariant(item.stage)}
            data-testid={`learning-loop-stage-${item.id}`}
            data-stage={item.stage}
          >
            {STAGE_LABEL[item.stage]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-3">
        <ol
          className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[10px]"
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
                {idx > 0 ? <ChevronRight className="h-2.5 w-2.5 opacity-40" /> : null}
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
            className="mt-1 text-[11px] text-rose-300/80"
            data-testid={`learning-loop-rejected-${item.id}`}
          >
            rejected — off the verification track
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
