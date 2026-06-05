import { useEffect, useMemo, useState, type ElementType } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CornerDownRight,
  ExternalLink,
  FileCode,
  GitMerge,
  Lightbulb,
  Scale,
  XCircle,
} from "lucide-react";
import type { AgentProfile, DebateTag, DebateUtterance } from "@ai-orchestrator/protocol";
import { defaultAgentProfiles } from "@ai-orchestrator/agents";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import type { Stage3DebateSession } from "../runtime/stage3Runtime";
import type { Stage3DebateUtteranceView } from "../types";

type Stance = "agree" | "disagree" | "risk" | "evidence" | "decision" | "neutral";

const stanceConfig: Record<Stance, { icon: ElementType; color: string; bg: string; label: string }> = {
  agree: { bg: "bg-emerald-500/10", color: "text-emerald-400", icon: CheckCircle2, label: "합의" },
  decision: { bg: "bg-violet-500/10", color: "text-violet-400", icon: ArrowRight, label: "결정" },
  disagree: { bg: "bg-rose-500/10", color: "text-rose-400", icon: XCircle, label: "반대" },
  evidence: { bg: "bg-cyan-500/10", color: "text-cyan-400", icon: Lightbulb, label: "근거" },
  neutral: { bg: "bg-zinc-500/10", color: "text-zinc-400", icon: Scale, label: "중립" },
  risk: { bg: "bg-amber-500/10", color: "text-amber-400", icon: AlertTriangle, label: "리스크" },
};

const roleBorderColors: Partial<Record<AgentProfile["role"], string>> = {
  architect: "border-l-violet-500",
  builder: "border-l-blue-500",
  executor: "border-l-amber-500",
  memory_curator: "border-l-purple-500",
  orchestrator: "border-l-cyan-500",
  reviewer: "border-l-rose-500",
  skeptic: "border-l-emerald-500",
  verifier: "border-l-lime-500",
};

export function Stage3DebateTable({
  onCreateCodingPacket,
  onOpenAnnex,
  onSelectUtterance,
  session,
}: {
  onCreateCodingPacket: () => void;
  onOpenAnnex?: () => void;
  onSelectUtterance?: (utterance: Stage3DebateUtteranceView) => void;
  session: Stage3DebateSession;
  agentVisualsById?: Record<string, { avatarDataUrl?: string }>;
}) {
  const [activeRoundIndex, setActiveRoundIndex] = useState(() => resolveDefaultRoundIndex(session));

  useEffect(() => {
    setActiveRoundIndex(resolveDefaultRoundIndex(session));
  }, [session.id]);

  const currentRound = session.rounds[activeRoundIndex] ?? session.rounds[0];
  const utteranceById = useMemo(() => {
    const map = new Map<string, Stage3DebateUtteranceView>();
    for (const round of session.rounds) {
      for (const utterance of round.utterances) {
        map.set(utterance.id, createUtteranceView(utterance, round.title, session));
      }
    }
    return map;
  }, [session]);
  const utterances = useMemo(
    () => currentRound?.utterances.map((utterance) => createUtteranceView(utterance, currentRound.title, session)) ?? [],
    [currentRound, session],
  );
  const consensus = useMemo(() => deriveConsensus(session), [session]);

  return (
    <section
      aria-label="Debate Chamber"
      className="flex h-full flex-col bg-transparent text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50"
      data-focus-id="debate-table-container"
      tabIndex={-1}
    >
      <header className="shrink-0 border-b border-zinc-800/60 bg-zinc-900/30 px-4 py-4 md:px-6">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Scale className="h-4 w-4 shrink-0 text-violet-400" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                  Debate Chamber
                </span>
              </div>
              <h1 className="mt-1 text-balance text-lg font-semibold text-zinc-100">
                {session.problem}
              </h1>
              <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-zinc-500">
                {session.summary}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {onOpenAnnex ? (
                <Button
                  className="border-zinc-700 text-xs"
                  onClick={onOpenAnnex}
                  size="sm"
                  variant="outline"
                >
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  Annex
                </Button>
              ) : null}
              <Button
                className="bg-violet-600 text-xs text-zinc-100 hover:bg-violet-700"
                onClick={onCreateCodingPacket}
                size="sm"
              >
                <FileCode className="mr-1.5 h-3.5 w-3.5" />
                패킷 반영
              </Button>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-1 overflow-x-auto pb-1">
            {session.rounds.map((round, index) => {
              const dotColor = roundDotColor(index, round.status);
              return (
                <button
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                    activeRoundIndex === index
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-100",
                  )}
                  key={round.id}
                  onClick={() => setActiveRoundIndex(index)}
                  type="button"
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      dotColor,
                      round.status === "running" && "animate-pulse",
                    )}
                  />
                  {round.title}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6 md:px-6">
        <div className="mx-auto max-w-4xl space-y-4">
          {utterances.map((utterance) => (
            <UtteranceCard
              key={utterance.id}
              onSelect={onSelectUtterance}
              utterance={utterance}
              utteranceById={utteranceById}
            />
          ))}
          {utterances.length === 0 ? (
            <div className="py-12 text-center">
              <Scale className="mx-auto h-8 w-8 text-zinc-700" />
              <p className="mt-2 text-sm text-zinc-500">이 라운드에 발언이 없습니다</p>
            </div>
          ) : null}
        </div>
      </div>

      <footer className="shrink-0 border-t border-zinc-800/60 bg-zinc-900/30 px-4 py-3 md:px-6">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <SummaryChip icon={CheckCircle2} label="합의" value={consensus.agreed} color="text-emerald-400" />
            <SummaryChip icon={XCircle} label="반대" value={consensus.disagreed} color="text-rose-400" />
            <SummaryChip icon={AlertTriangle} label="리스크" value={consensus.risks} color="text-amber-400" />
            <SummaryChip icon={ArrowRight} label="결정" value={consensus.decisions} color="text-violet-400" />
          </div>
          <div className="text-xs text-zinc-500">
            {session.participants.length} agents · {currentRound?.status ?? "pending"}
          </div>
        </div>
      </footer>
    </section>
  );
}

function resolveDefaultRoundIndex(session: Stage3DebateSession) {
  const runningIndex = session.rounds.findIndex((round) => round.status === "running");
  if (runningIndex >= 0) return runningIndex;
  const lastCompletedIndex = session.rounds.map((round) => round.status).lastIndexOf("completed");
  if (lastCompletedIndex >= 0) return lastCompletedIndex;
  return 0;
}

function roundDotColor(index: number, status: Stage3DebateSession["rounds"][number]["status"]) {
  if (status === "blocked") return "bg-rose-500";
  if (status === "running") return "bg-amber-500";
  if (status === "pending") return "bg-zinc-600";
  const completedAccentColors = ["bg-cyan-500", "bg-violet-500", "bg-rose-500", "bg-amber-500", "bg-emerald-500"];
  return completedAccentColors[index % completedAccentColors.length];
}

function createUtteranceView(
  utterance: DebateUtterance,
  roundTitle: string,
  session: Stage3DebateSession,
): Stage3DebateUtteranceView {
  const participant = session.participants.find((p) => p.agentId === utterance.agentId);
  const fallback = resolveFallbackAgent(utterance.agentId);
  return {
    ...utterance,
    agentName: participant?.name ?? fallback.name,
    agentRole: participant?.role ?? fallback.role,
    roundTitle,
  };
}

function resolveFallbackAgent(agentId: string) {
  const profile = defaultAgentProfiles.find((p) => p.id === agentId);
  if (profile) {
    return { name: profile.name, role: profile.role };
  }
  const parts = agentId.replace(/^agent_/, "").split("_");
  const role = (parts[0] || "builder") as AgentProfile["role"];
  const name = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
  return { name, role };
}

function UtteranceCard({
  onSelect,
  utterance,
  utteranceById,
}: {
  onSelect?: (utterance: Stage3DebateUtteranceView) => void;
  utterance: Stage3DebateUtteranceView;
  utteranceById: Map<string, Stage3DebateUtteranceView>;
}) {
  const stance = resolveStance(utterance);
  const config = stanceConfig[stance];
  const Icon = config.icon;
  const isDecisionNode = Boolean(utterance.decisionId);
  const parent = utterance.parentUtteranceId ? utteranceById.get(utterance.parentUtteranceId) : undefined;
  const borderColor = roleBorderColors[utterance.agentRole] ?? "border-l-zinc-600";

  return (
    <div
      className={cn(
        "rounded-lg border border-zinc-800/60 border-l-2 bg-zinc-900/40 p-4 transition-all hover:border-zinc-700 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 block w-full",
        borderColor,
        isDecisionNode && "ring-1 ring-violet-500/30",
        onSelect && "cursor-pointer",
      )}
      onClick={() => onSelect?.(utterance)}
      onKeyDown={(event) => {
        if (onSelect && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onSelect(utterance);
        }
      }}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
    >
      <div className="flex items-start gap-3">
        <div className={cn("mt-0.5 rounded-md p-1.5", config.bg)}>
          <Icon className={cn("h-4 w-4", config.color)} />
        </div>
        <div className="min-w-0 flex-1">
          <header className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-zinc-100">{utterance.agentName}</span>
            <span className="text-xs text-zinc-500">{roleLabel(utterance.agentRole)}</span>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", config.bg, config.color)}>
              {config.label}
            </span>
            {isDecisionNode ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-400">
                <GitMerge className="h-2.5 w-2.5" />
                결정
              </span>
            ) : null}
          </header>
          {parent ? (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500">
              <CornerDownRight className="h-3 w-3" />
              <span>
                <span className="text-zinc-300">{parent.agentName}</span>의 {parent.roundTitle} 발언에 응답
              </span>
            </div>
          ) : null}
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
            {utterance.content}
          </p>
          <footer className="mt-3 flex flex-wrap items-center gap-2">
            {utterance.tags.map((tag) => (
              <TagPill key={tag} tag={tag} />
            ))}
            {(utterance.evidenceRefIds?.length ?? 0) > 0 ? (
              <span className="text-xs text-cyan-400">Evidence {utterance.evidenceRefIds?.length}</span>
            ) : null}
            {(utterance.codingImpactRefs?.length ?? 0) > 0 ? (
              <span className="text-xs text-violet-400">Coding {utterance.codingImpactRefs?.length}</span>
            ) : null}
            <span className="ml-auto text-[10px] text-zinc-600">
              {new Date(utterance.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </footer>
        </div>
      </div>
    </div>
  );
}

function resolveStance(utterance: Stage3DebateUtteranceView): Stance {
  if (utterance.decisionId) return "decision";
  if (utterance.tags.includes("risk")) return "risk";
  if (utterance.tags.includes("objection")) return "disagree";
  if (utterance.tags.includes("agreement")) return "agree";
  if (utterance.tags.includes("evidence") || utterance.tags.includes("coding_impact")) return "evidence";
  return "neutral";
}

function TagPill({ tag }: { tag: DebateTag }) {
  const styles: Record<DebateTag, string> = {
    agreement: "bg-emerald-500/10 text-emerald-400",
    coding_impact: "bg-violet-500/10 text-violet-400",
    evidence: "bg-cyan-500/10 text-cyan-400",
    objection: "bg-rose-500/10 text-rose-400",
    risk: "bg-amber-500/10 text-amber-400",
  };
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", styles[tag])}>
      {debateTagLabel(tag)}
    </span>
  );
}

function SummaryChip({
  color,
  icon: Icon,
  label,
  value,
}: {
  color: string;
  icon: ElementType;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <Icon className={cn("h-3.5 w-3.5", color)} />
      <span className="text-zinc-500">{label}</span>
      <span className={cn("font-medium", color)}>{value}</span>
    </div>
  );
}

function deriveConsensus(session: Stage3DebateSession) {
  let agreed = 0;
  let disagreed = 0;
  let risks = 0;
  let decisions = 0;
  for (const round of session.rounds) {
    for (const utterance of round.utterances) {
      if (utterance.tags.includes("agreement")) agreed += 1;
      if (utterance.tags.includes("objection")) disagreed += 1;
      if (utterance.tags.includes("risk")) risks += 1;
      if (utterance.decisionId || utterance.tags.includes("coding_impact")) decisions += 1;
    }
  }
  return { agreed, decisions, disagreed, risks };
}

function roleLabel(role: AgentProfile["role"]) {
  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function debateTagLabel(tag: DebateTag) {
  const labels: Record<DebateTag, string> = {
    agreement: "합의",
    coding_impact: "코딩 영향",
    evidence: "근거",
    objection: "반대",
    risk: "리스크",
  };
  return labels[tag];
}
