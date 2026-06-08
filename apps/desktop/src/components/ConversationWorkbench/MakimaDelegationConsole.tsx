import { CheckCircle2, GitBranch, Play, Sparkles, UsersRound } from "lucide-react";
import { Button } from "@/ui/button";
import {
  createMakimaDelegationStatusCopy,
  type MakimaDelegationAssignmentView,
  type MakimaDelegationCard,
} from "../../lib/makimaDelegation";

export function MakimaDelegationConsole({
  assignmentsByAgentId = {},
  cards,
  request,
  onCreateAssignment,
  onCreateAllAssignments,
  onOpenAssignedAgent,
  onProgressAssignment,
}: {
  assignmentsByAgentId?: Record<string, MakimaDelegationAssignmentView>;
  cards: MakimaDelegationCard[];
  request: string;
  onCreateAssignment: (card: MakimaDelegationCard) => void;
  onCreateAllAssignments: (cards: MakimaDelegationCard[]) => void;
  onOpenAssignedAgent?: (agentId: string) => void;
  onProgressAssignment?: (card: MakimaDelegationCard, assignment: MakimaDelegationAssignmentView) => void;
}) {
  if (cards.length === 0) {
    return null;
  }

  const unassignedCards = cards.filter((card) => !assignmentsByAgentId[card.targetAgentId]);

  return (
    <section
      aria-label="마키마 지휘 콘솔"
      className="shrink-0 border-b border-cyan-300/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_32%),linear-gradient(135deg,rgba(9,9,11,0.98),rgba(24,24,27,0.92))] px-4 py-3"
      data-focus-id="makima-delegation-console"
    >
      <div className="mx-auto max-w-5xl space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-200 shadow-[0_0_28px_rgba(34,211,238,0.16)]">
                <UsersRound className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-zinc-100">마키마 지휘 콘솔</p>
                <p className="text-[11px] text-zinc-500">요청을 에이전트별 작업 카드로 쪼개고 Control Queue에 연결합니다.</p>
              </div>
            </div>
          </div>
          <Button
            className="h-8 border-cyan-300/20 bg-cyan-400/10 px-3 text-xs text-cyan-100 hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:border-zinc-700/60 disabled:bg-zinc-900/50 disabled:text-zinc-500"
            disabled={unassignedCards.length === 0}
            onClick={() => onCreateAllAssignments(unassignedCards)}
            size="sm"
            type="button"
            variant="outline"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {unassignedCards.length === 0 ? "전체 배정됨" : "전체 배정 생성"}
          </Button>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[12px] text-zinc-400">
          <span className="text-zinc-500">현재 지휘 기준:</span>{" "}
          <span className="text-zinc-200">{request.trim() || "현재 대화 흐름을 이어서 완성"}</span>
        </div>

        <div className="grid gap-2 xl:grid-cols-5">
          {cards.map((card) => {
            const assignment = assignmentsByAgentId[card.targetAgentId];
            const assigned = Boolean(assignment);
            const statusCopy = createMakimaDelegationStatusCopy(assignment);

            return (
              <article
                className={`group flex min-h-44 flex-col justify-between rounded-2xl border p-3 shadow-[0_18px_60px_rgba(0,0,0,0.28)] transition ${
                  assigned
                    ? "border-emerald-300/20 bg-emerald-950/20"
                    : "border-white/10 bg-zinc-950/70 hover:border-cyan-300/30 hover:bg-zinc-900/80"
                }`}
                key={card.id}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-zinc-100">{card.targetAgentName}</p>
                      <p className="text-[11px] text-cyan-200">{card.targetRoleLabel} · {card.toolLabel}</p>
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] tracking-wide ${statusToneClass(statusCopy.tone)}`}>
                      {statusCopy.label}
                    </span>
                  </div>
                  <div>
                    <p className="text-[13px] font-medium text-zinc-200">{card.title.replace(`${card.targetAgentName}에게 `, "")}</p>
                    <p className="mt-1 line-clamp-3 text-[11px] leading-5 text-zinc-500">{card.summary}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {card.toolPreview.map((tool) => (
                      <span
                        className="rounded-full border border-violet-300/15 bg-violet-400/10 px-2 py-0.5 text-[10px] text-violet-100"
                        key={tool}
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 pt-2">
                  <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500">
                    <GitBranch className="h-3 w-3" />
                    {surfaceLabel(card.targetSurface)}
                  </span>
                  {assigned && assignment ? (
                    <div className="flex items-center gap-1">
                      <Button
                        className="h-7 border-cyan-300/20 bg-cyan-400/10 px-2 text-[11px] text-cyan-100 hover:bg-cyan-400/15"
                        onClick={() =>
                          assignment.status === "done"
                            ? onOpenAssignedAgent?.(card.targetAgentId)
                            : onProgressAssignment?.(card, assignment)
                        }
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <Play className="h-3 w-3" />
                        {statusCopy.actionLabel}
                      </Button>
                      <Button
                        className="h-7 border-white/10 bg-white/[0.03] px-2 text-[11px] text-zinc-300 hover:bg-white/[0.06]"
                        onClick={() => onOpenAssignedAgent?.(card.targetAgentId)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        대화
                      </Button>
                    </div>
                  ) : (
                    <Button
                      className="h-7 border-emerald-300/20 bg-emerald-400/10 px-2 text-[11px] text-emerald-100 hover:bg-emerald-400/15"
                      onClick={() => onCreateAssignment(card)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Play className="h-3 w-3" />
                      배정
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          배정하면 작업 항목과 승인 대기 handoff가 함께 생성됩니다.
        </div>
      </div>
    </section>
  );
}

function surfaceLabel(surface: MakimaDelegationCard["targetSurface"]) {
  const labels: Record<MakimaDelegationCard["targetSurface"], string> = {
    coding_packet: "Coding Packet",
    conversation: "Conversation",
    debate: "Debate",
    execution_slot: "Execution",
    mobile: "Mobile",
    notion: "Notion",
    obsidian: "Obsidian",
    tmux: "Tmux",
  };
  return labels[surface] ?? surface;
}

function statusToneClass(tone: ReturnType<typeof createMakimaDelegationStatusCopy>["tone"]) {
  const classes = {
    amber: "border-amber-300/20 bg-amber-400/10 text-amber-100",
    cyan: "border-cyan-300/20 bg-cyan-400/10 text-cyan-100",
    emerald: "border-emerald-300/20 bg-emerald-400/10 text-emerald-100",
    rose: "border-rose-300/20 bg-rose-400/10 text-rose-100",
    violet: "border-violet-300/20 bg-violet-400/10 text-violet-100",
  } satisfies Record<ReturnType<typeof createMakimaDelegationStatusCopy>["tone"], string>;

  return classes[tone];
}
