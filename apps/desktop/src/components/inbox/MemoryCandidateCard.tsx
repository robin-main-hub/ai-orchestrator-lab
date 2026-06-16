import { Brain, Sparkles, PenLine, FlaskConical } from "lucide-react";
import { Card, CardContent, CardHeader } from "../ui/card";
import { Badge } from "../ui/badge";

/**
 * LINE F — Memory candidate card.
 *
 * Read-only, presentational. A suggested memory shows its lifecycle
 * status (suggested → written → eval), its origin, and an honest
 * `observed` flag. A non-observed candidate NEVER shows a write/enable
 * affordance — we don't fabricate that something landed.
 */

export type MemoryStatus = "suggested" | "written" | "eval";
export type MemoryOrigin = "learning_loop" | "evidence_bridge";

export type MemoryCandidateItem = {
  id: string;
  title: string;
  status: MemoryStatus;
  origin: MemoryOrigin;
  /** Honest: did we actually observe this candidate's effect / write? */
  observed: boolean;
  /** Optional compact note. */
  note?: string;
};

const STATUS_LABEL: Record<MemoryStatus, string> = {
  suggested: "suggested",
  written: "written",
  eval: "eval",
};

const ORIGIN_LABEL: Record<MemoryOrigin, string> = {
  learning_loop: "learning_loop",
  evidence_bridge: "evidence_bridge",
};

function statusVariant(status: MemoryStatus) {
  if (status === "written") return "default" as const;
  if (status === "eval") return "outline" as const;
  return "secondary" as const;
}

export function MemoryCandidateCard({ item }: { item: MemoryCandidateItem }) {
  return (
    <Card
      className="gap-2 border-white/10 bg-white/[0.02] py-3"
      data-testid={`memory-candidate-card-${item.id}`}
      data-status={item.status}
      data-origin={item.origin}
      data-observed={item.observed ? "true" : "false"}
    >
      <CardHeader className="px-3">
        <div className="flex flex-wrap items-center gap-2">
          <Brain className="h-3.5 w-3.5 text-emerald-300/80" />
          <span className="text-sm font-semibold">{item.title}</span>
          <Badge
            variant={statusVariant(item.status)}
            data-testid={`memory-status-${item.id}`}
            data-status={item.status}
          >
            {item.status === "suggested" ? (
              <Sparkles className="mr-1 inline h-3 w-3" />
            ) : item.status === "written" ? (
              <PenLine className="mr-1 inline h-3 w-3" />
            ) : (
              <FlaskConical className="mr-1 inline h-3 w-3" />
            )}
            {STATUS_LABEL[item.status]}
          </Badge>
          <Badge
            variant="outline"
            data-testid={`memory-origin-${item.id}`}
            data-origin={item.origin}
          >
            {ORIGIN_LABEL[item.origin]}
          </Badge>
          <Badge
            variant={item.observed ? "outline" : "destructive"}
            data-testid={`memory-observed-${item.id}`}
            data-observed={item.observed ? "true" : "false"}
          >
            {item.observed ? "observed" : "not observed"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-3">
        {item.note ? (
          <p className="text-xs text-muted-foreground" data-testid={`memory-note-${item.id}`}>
            {item.note}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
