import { useEffect, useMemo, useState, type ElementType } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Code2,
  CornerDownRight,
  ExternalLink,
  FileCode,
  FileText,
  GitMerge,
  Lightbulb,
  Scale,
  XCircle,
} from "lucide-react";
import type { AgentProfile, DebateTag, DebateUtterance } from "@ai-orchestrator/protocol";
import { defaultAgentProfiles } from "@ai-orchestrator/agents";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import { deriveDebateDecisionReadiness, type DebateDecisionReadiness } from "../lib/debateDecisionReadiness";
import { createDebateUtterancePublicWorkTrace } from "../lib/publicWorkTrace";
import type { Stage3DebateSession } from "../runtime/stage3Runtime";
import type { Stage3DebateUtteranceView } from "../types";
import { PublicWorkTracePanel } from "./PublicWorkTracePanel";

type Stance = "agree" | "disagree" | "risk" | "evidence" | "decision" | "neutral";

const stanceConfig: Record<Stance, { icon: ElementType; color: string; bg: string; label: string }> = {
  agree: { bg: "bg-cyan-500/10", color: "text-cyan-300", icon: CheckCircle2, label: "합의" },
  decision: { bg: "bg-violet-500/10", color: "text-violet-400", icon: ArrowRight, label: "결정" },
  disagree: { bg: "bg-rose-500/10", color: "text-rose-400", icon: XCircle, label: "반대" },
  evidence: { bg: "bg-cyan-500/10", color: "text-cyan-400", icon: Lightbulb, label: "근거" },
  neutral: { bg: "bg-zinc-500/10", color: "text-zinc-400", icon: Scale, label: "중립" },
  risk: { bg: "bg-amber-500/10", color: "text-amber-400", icon: AlertTriangle, label: "리스크" },
};

const roleToneConfig: Partial<Record<AgentProfile["role"], { bg: string; border: string; text: string }>> = {
  architect: { bg: "bg-violet-500/10", border: "border-violet-500/30", text: "text-violet-300" },
  builder: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-300" },
  executor: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-300" },
  memory_curator: { bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-300" },
  orchestrator: { bg: "bg-cyan-500/10", border: "border-cyan-500/30", text: "text-cyan-300" },
  reviewer: { bg: "bg-rose-500/10", border: "border-rose-500/30", text: "text-rose-300" },
  skeptic: { bg: "bg-violet-500/10", border: "border-violet-500/30", text: "text-violet-300" },
  verifier: { bg: "bg-cyan-500/10", border: "border-cyan-500/30", text: "text-cyan-300" },
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
  const readiness = useMemo(() => deriveDebateDecisionReadiness(session), [session]);

  return (
    <section
      aria-label="Debate Chamber"
      className="flex h-full flex-col bg-transparent text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50"
      data-focus-id="debate-table-container"
      tabIndex={-1}
    >
      <header className="shrink-0 border-b border-zinc-800/60 bg-zinc-900/30 px-4 py-4 md:px-6">
        <div className="mx-auto max-w-4xl">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan-500/20 bg-cyan-500/10">
                <FileText className="h-5 w-5 text-cyan-300" />
              </div>
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
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
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
                title={readiness.nextActionLabel}
              >
                <FileCode className="mr-1.5 h-3.5 w-3.5" />
                패킷 반영
              </Button>
            </div>
          </div>

          <DebateReadinessBanner readiness={readiness} />

          <div className="mt-4 flex items-center gap-1 overflow-x-auto pb-1">
            {session.rounds.map((round, index) => {
              const dotColor = roundDotColor(index, round.status);
              return (
                <button
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                    activeRoundIndex === index
                      ? "bg-zinc-800 text-zinc-100 ring-1 ring-zinc-700"
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
        <div className="mx-auto max-w-4xl">
          {utterances.length > 0 ? (
            <ol aria-label="토론 타임라인" className="relative space-y-3">
              <div className="absolute bottom-0 left-[22px] top-0 w-px bg-gradient-to-b from-zinc-800 via-zinc-700 to-zinc-800" />
              {utterances.map((utterance, index) => (
                <li
                  aria-label={`${stanceConfig[resolveStance(utterance)].label}: ${utterance.agentName}`}
                  className="relative pl-8"
                  key={utterance.id}
                >
                  <div className="absolute left-[18px] top-6 h-2 w-2 rounded-full bg-zinc-600 ring-4 ring-zinc-950" />
                  <UtteranceCard
                    index={index}
                    onSelect={onSelectUtterance}
                    utterance={utterance}
                    utteranceById={utteranceById}
                  />
                </li>
              ))}
            </ol>
          ) : null}
          {utterances.length === 0 ? (
            <div className="py-12 text-center">
              <Scale className="mx-auto h-8 w-8 text-zinc-700" />
              <p className="mt-2 text-sm text-zinc-500">이 라운드에 발언이 없습니다</p>
            </div>
          ) : null}
        </div>
      </div>

      <footer className="shrink-0 border-t border-zinc-900/70 bg-zinc-950/30 px-4 py-2 md:px-6">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <SummaryChip icon={CheckCircle2} label="합의" value={consensus.agreed} color="text-cyan-300" />
            <SummaryChip icon={XCircle} label="반대" value={consensus.disagreed} color="text-rose-400" />
            <SummaryChip icon={AlertTriangle} label="리스크" value={consensus.risks} color="text-amber-400" />
            <SummaryChip icon={ArrowRight} label="결정" value={consensus.decisions} color="text-violet-400" />
          </div>
          <div className="text-xs text-zinc-500">
            {session.participants.length} agents · {currentRound?.status ?? "pending"} · {readiness.headline}
          </div>
        </div>
      </footer>
    </section>
  );
}

function DebateReadinessBanner({ readiness }: { readiness: DebateDecisionReadiness }) {
  const tone = {
    blocked: {
      border: "border-rose-500/30",
      dot: "bg-rose-400",
      text: "text-rose-300",
    },
    needs_review: {
      border: "border-amber-500/30",
      dot: "bg-amber-400",
      text: "text-amber-300",
    },
    ready: {
      border: "border-violet-500/30",
      dot: "bg-violet-400",
      text: "text-violet-300",
    },
  }[readiness.state];

  return (
    <div className={cn("mt-4 rounded-xl border bg-zinc-950/35 p-3", tone.border)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("h-2 w-2 rounded-full", tone.dot)} />
            <strong className={cn("text-sm", tone.text)}>{readiness.headline}</strong>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">{readiness.nextActionLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-wider text-zinc-500">
          <span>decision {readiness.decisionCount}</span>
          <span>coding {readiness.codingImpactCount}</span>
          <span>evidence {readiness.evidenceCount}</span>
          <span>risk {readiness.riskCount}</span>
          <span>objection {readiness.objectionCount}</span>
        </div>
      </div>
      {readiness.blockers.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {readiness.blockers.slice(0, 3).map((blocker) => (
            <span
              className="rounded-full border border-zinc-800/80 bg-black/25 px-2 py-0.5 text-[10px] text-zinc-400"
              key={blocker}
            >
              {blocker}
            </span>
          ))}
        </div>
      ) : null}
    </div>
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
  if (status === "running") return "bg-violet-500";
  if (status === "pending") return "bg-zinc-600";
  const completedAccentColors = ["bg-zinc-500", "bg-cyan-500", "bg-violet-500", "bg-rose-500", "bg-amber-500"];
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
  index,
  onSelect,
  utterance,
  utteranceById,
}: {
  index: number;
  onSelect?: (utterance: Stage3DebateUtteranceView) => void;
  utterance: Stage3DebateUtteranceView;
  utteranceById: Map<string, Stage3DebateUtteranceView>;
}) {
  const stance = resolveStance(utterance);
  const config = stanceConfig[stance];
  const isDecisionNode = Boolean(utterance.decisionId);
  const parent = utterance.parentUtteranceId ? utteranceById.get(utterance.parentUtteranceId) : undefined;
  const roleTone = roleToneConfig[utterance.agentRole] ?? {
    bg: "bg-zinc-500/10",
    border: "border-zinc-600/30",
    text: "text-zinc-300",
  };
  const acceptedCount = utterance.acceptedBy?.length ?? 0;
  const rejectedCount = utterance.rejectedBy?.length ?? 0;
  const evidenceCount = utterance.evidenceRefIds?.length ?? 0;
  const codingCount = utterance.codingImpactRefs?.length ?? 0;
  const hasProvenance = acceptedCount > 0 || rejectedCount > 0 || evidenceCount > 0 || codingCount > 0;
  const publicWorkTrace = createDebateUtterancePublicWorkTrace(utterance);

  return (
    <article
      className={cn("group relative text-left focus:outline-none", onSelect && "cursor-pointer")}
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
      {isDecisionNode ? (
        <div className="absolute -inset-px rounded-xl bg-gradient-to-r from-violet-500/20 via-cyan-500/20 to-violet-500/20 blur-sm" />
      ) : null}

      <div
        className={cn(
          "relative flex gap-3 rounded-xl border border-zinc-800/50 bg-zinc-900/50 p-4 transition-all",
          "hover:border-zinc-700/50 hover:bg-zinc-900/70",
          "focus-within:ring-2 focus-within:ring-cyan-500/40",
          isDecisionNode && "bg-zinc-900/60 ring-1 ring-violet-500/30",
        )}
      >
        <div className={cn("w-1 shrink-0 rounded-full border", roleTone.bg, roleTone.border)} />
        <div className="min-w-0 flex-1 space-y-3">
          <header className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
                  roleTone.bg,
                  roleTone.text,
                )}
              >
                {utterance.agentName.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className={cn("truncate text-sm font-medium", roleTone.text)}>
                  {utterance.agentName}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                  {roleLabel(utterance.agentRole)}
                </div>
              </div>
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", config.bg, config.color)}>
                {config.label}
              </span>
              {isDecisionNode ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-300">
                  <GitMerge className="h-3 w-3" />
                  결정
                </span>
              ) : null}
            </div>
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-zinc-500">
              {new Date(utterance.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </header>

          {parent ? (
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <CornerDownRight className="h-3 w-3" />
              <span>
                <span className="text-zinc-400">{parent.agentName}</span>의 {parent.roundTitle} 발언에 응답
              </span>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-1.5">
            {utterance.tags.map((tag) => (
              <TagPill key={tag} tag={tag} />
            ))}
          </div>

          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
            {utterance.content}
          </p>

          <PublicWorkTracePanel className="sm:grid-cols-3" trace={publicWorkTrace} />

          {hasProvenance ? (
            <footer className="flex flex-wrap items-center gap-2 border-t border-zinc-800/50 pt-2">
              {acceptedCount > 0 ? (
                <ProvenancePill icon={CheckCircle2} label={`수용 ${acceptedCount}`} tone="text-cyan-300" />
              ) : null}
              {rejectedCount > 0 ? (
                <ProvenancePill icon={XCircle} label={`기각 ${rejectedCount}`} tone="text-rose-400" />
              ) : null}
              {evidenceCount > 0 ? (
                <ProvenancePill icon={FileText} label={`근거 ${evidenceCount}`} tone="text-cyan-400" />
              ) : null}
              {codingCount > 0 ? (
                <ProvenancePill icon={Code2} label={`코딩 ${codingCount}`} tone="text-violet-400" />
              ) : null}
              <span className="ml-auto text-[10px] text-zinc-600">#{index + 1}</span>
            </footer>
          ) : null}
        </div>
      </div>
    </article>
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
    agreement: "bg-cyan-500/10 text-cyan-300",
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

function ProvenancePill({
  icon: Icon,
  label,
  tone,
}: {
  icon: ElementType;
  label: string;
  tone: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-zinc-800/80 bg-zinc-950/40 px-2 py-0.5 text-[10px] text-zinc-500">
      <Icon className={cn("h-3 w-3", tone)} />
      {label}
    </span>
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
