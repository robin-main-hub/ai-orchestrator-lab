import { useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Code2,
  CornerDownRight,
  Eye,
  FileSearch,
  FileText,
  GitMerge,
  Inbox,
  Link2,
  PanelRightOpen,
  Send,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import type { AgentProfile, DebateTag, DebateUtterance } from "@ai-orchestrator/protocol";
import type { HumanPeekEntry, Stage3DebateSession, StatusHubItem } from "../runtime/stage3Runtime";
import type { Stage3DebateUtteranceView } from "../types";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import { StatusBadge } from "@/ui/status-badge";
import { AvatarWithStatus, roleColorFromRole } from "@/ui/avatar-with-status";
import { defaultAgentProfiles } from "@ai-orchestrator/agents";

type RoleTone = {
  accent: string;
  avatar: string;
  bar: string;
  glow: string;
  text: string;
};

const roleTones: Partial<Record<AgentProfile["role"], RoleTone>> = {
  orchestrator: {
    accent: "border-cyan-400/30 bg-cyan-500/10",
    avatar: "bg-cyan-500/15 text-cyan-200",
    bar: "border-cyan-400/50 bg-cyan-400/15",
    glow: "shadow-cyan-950/30",
    text: "text-cyan-300",
  },
  architect: {
    accent: "border-violet-400/30 bg-violet-500/10",
    avatar: "bg-violet-500/15 text-violet-200",
    bar: "border-violet-400/50 bg-violet-400/15",
    glow: "shadow-violet-950/30",
    text: "text-violet-300",
  },
  reviewer: {
    accent: "border-amber-400/30 bg-amber-500/10",
    avatar: "bg-amber-500/15 text-amber-200",
    bar: "border-amber-400/50 bg-amber-400/15",
    glow: "shadow-amber-950/30",
    text: "text-amber-300",
  },
  builder: {
    accent: "border-blue-400/30 bg-blue-500/10",
    avatar: "bg-blue-500/15 text-blue-200",
    bar: "border-blue-400/50 bg-blue-400/15",
    glow: "shadow-blue-950/30",
    text: "text-blue-300",
  },
  executor: {
    accent: "border-rose-400/30 bg-rose-500/10",
    avatar: "bg-rose-500/15 text-rose-200",
    bar: "border-rose-400/50 bg-rose-400/15",
    glow: "shadow-rose-950/30",
    text: "text-rose-300",
  },
  skeptic: {
    accent: "border-emerald-400/30 bg-emerald-500/10",
    avatar: "bg-emerald-500/15 text-emerald-200",
    bar: "border-emerald-400/50 bg-emerald-400/15",
    glow: "shadow-emerald-950/30",
    text: "text-emerald-300",
  },
  verifier: {
    accent: "border-lime-400/30 bg-lime-500/10",
    avatar: "bg-lime-500/15 text-lime-200",
    bar: "border-lime-400/50 bg-lime-400/15",
    glow: "shadow-lime-950/30",
    text: "text-lime-300",
  },
  memory_curator: {
    accent: "border-purple-400/30 bg-purple-500/10",
    avatar: "bg-purple-500/15 text-purple-200",
    bar: "border-purple-400/50 bg-purple-400/15",
    glow: "shadow-purple-950/30",
    text: "text-purple-300",
  },
};

const fallbackTone: RoleTone = {
  accent: "border-zinc-700/60 bg-zinc-900/60",
  avatar: "bg-zinc-800 text-zinc-200",
  bar: "border-zinc-600 bg-zinc-700/40",
  glow: "shadow-black/30",
  text: "text-zinc-300",
};

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

export function Stage3DebateTable({
  onCreateCodingPacket,
  onSelectUtterance,
  session,
  agentVisualsById = {},
}: {
  onCreateCodingPacket: () => void;
  onSelectUtterance?: (utterance: Stage3DebateUtteranceView) => void;
  session: Stage3DebateSession;
  agentVisualsById?: Record<string, { avatarDataUrl?: string }>;
}) {
  const [annexOpen, setAnnexOpen] = useState(false);
  const [prevSessionId, setPrevSessionId] = useState(session.id);
  const [activeRoundId, setActiveRoundId] = useState<string>(() => {
    const runningRound = session.rounds.find((r) => r.status === "running");
    if (runningRound) return runningRound.id;
    const completedRounds = session.rounds.filter((r) => r.status === "completed");
    if (completedRounds.length > 0) {
      return completedRounds[completedRounds.length - 1]?.id ?? "";
    }
    return session.rounds[0]?.id ?? "";
  });

  if (session.id !== prevSessionId) {
    setPrevSessionId(session.id);
    const runningRound = session.rounds.find((r) => r.status === "running");
    const defaultRoundId =
      runningRound?.id ??
      session.rounds.filter((r) => r.status === "completed").slice(-1)[0]?.id ??
      session.rounds[0]?.id ??
      "";
    setActiveRoundId(defaultRoundId);
  }

  const activeRound = session.rounds.find((r) => r.id === activeRoundId);

  const utteranceById = useMemo(() => {
    const map = new Map<string, Stage3DebateUtteranceView>();
    for (const round of session.rounds) {
      for (const utterance of round.utterances) {
        map.set(utterance.id, createUtteranceView(utterance, round.title, session));
      }
    }
    return map;
  }, [session]);

  const utterances = useMemo(() => {
    if (!activeRound) return [];
    return activeRound.utterances.map((utterance) =>
      createUtteranceView(utterance, activeRound.title, session),
    );
  }, [activeRound, session]);

  return (
    <section
      aria-label="Debate"
      className="relative flex h-full flex-col overflow-hidden bg-zinc-950 text-zinc-100"
      data-focus-id="debate-table-container"
      tabIndex={-1}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(34,211,238,0.13),transparent_34%),radial-gradient(circle_at_88%_12%,rgba(168,85,247,0.12),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_24%)]" />
      <DebateContextHeader
        currentRoundId={activeRoundId}
        onSelectRoundId={setActiveRoundId}
        onCreateCodingPacket={onCreateCodingPacket}
        onOpenAnnex={() => setAnnexOpen(true)}
        rounds={session.rounds}
        session={session}
      />
      <DebateTimeline
        activeRound={activeRound}
        agentVisualsById={agentVisualsById}
        onSelect={onSelectUtterance}
        utteranceById={utteranceById}
        utterances={utterances}
      />
      <ConsensusSummary
        roundStatus={activeRound?.status ?? "pending"}
        utterances={utterances}
      />
      <DebateAnnex
        entries={session.humanPeek}
        isOpen={annexOpen}
        items={session.statusHub}
        onClose={() => setAnnexOpen(false)}
      />
    </section>
  );
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

function DebateContextHeader({
  currentRoundId,
  onSelectRoundId,
  onCreateCodingPacket,
  onOpenAnnex,
  rounds,
  session,
}: {
  currentRoundId?: string;
  onSelectRoundId: (id: string) => void;
  onCreateCodingPacket: () => void;
  onOpenAnnex: () => void;
  rounds: Stage3DebateSession["rounds"];
  session: Stage3DebateSession;
}) {
  return (
    <header className="relative z-10 shrink-0 border-b border-white/10 bg-zinc-950/75 backdrop-blur-xl">
      <div className="flex items-start gap-4 px-4 py-3 md:px-6">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-500/10 shadow-[0_0_32px_rgba(34,211,238,0.18)]">
          <Sparkles className="h-4 w-4 text-cyan-300" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-300">
              Debate Context
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-zinc-500">
              {session.participants.length} agents
            </span>
          </div>
          <h2 className="mt-1 truncate text-sm font-semibold text-zinc-100 md:text-base">
            {session.problem}
          </h2>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-500">
            {session.summary}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            className="gap-2 border-white/10 bg-white/[0.04] text-zinc-200 hover:bg-white/10"
            onClick={onOpenAnnex}
            size="sm"
            variant="outline"
          >
            <PanelRightOpen className="h-3.5 w-3.5 text-cyan-300" />
            Inspector
          </Button>
          <Button
            className="gap-2 bg-gradient-to-r from-cyan-500 to-violet-500 text-white shadow-lg shadow-cyan-950/30"
            onClick={onCreateCodingPacket}
            size="sm"
          >
            <FileText className="h-3.5 w-3.5" />
            패킷 반영
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-1 overflow-x-auto border-t border-white/[0.06] px-4 py-2 md:px-6">
        {rounds.map((round, index) => {
          const isActive = round.id === currentRoundId;
          const isCompleted = round.status === "completed";
          return (
            <button
              className={cn(
                "group relative flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-all",
                isActive
                  ? "bg-white/10 text-zinc-100 shadow-lg shadow-black/20"
                  : isCompleted
                    ? "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"
                    : "text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-400",
              )}
              key={round.id}
              onClick={() => onSelectRoundId(round.id)}
              type="button"
            >
              <span className="font-mono text-[10px] text-zinc-600">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>{round.title}</span>
              {round.status === "running" ? (
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
              ) : null}
              {isActive ? (
                <span className="absolute inset-x-3 -bottom-2 h-px bg-gradient-to-r from-cyan-400 to-violet-400" />
              ) : null}
            </button>
          );
        })}
      </div>
    </header>
  );
}

function DebateTimeline({
  activeRound,
  agentVisualsById,
  onSelect,
  utteranceById,
  utterances,
}: {
  activeRound?: Stage3DebateSession["rounds"][number];
  agentVisualsById: Record<string, { avatarDataUrl?: string }>;
  onSelect?: (utterance: Stage3DebateUtteranceView) => void;
  utteranceById: Map<string, Stage3DebateUtteranceView>;
  utterances: Stage3DebateUtteranceView[];
}) {
  if (!activeRound) {
    return (
      <div className="relative z-10 flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-zinc-500">라운드를 선택해주세요.</p>
      </div>
    );
  }

  if (utterances.length === 0) {
    return (
      <div className="relative z-10 flex flex-1 items-center justify-center p-8">
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] px-8 py-10 text-center backdrop-blur-xl">
          <p className="text-sm text-zinc-300">아직 발언이 없습니다.</p>
          <p className="mt-1 text-xs text-zinc-500">
            {activeRound.status === "running" ? "토론이 진행 중입니다..." : "토론 대기 중"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-10 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-5 md:px-6">
        <div className="relative">
          <div className="absolute bottom-0 left-[18px] top-0 w-px bg-gradient-to-b from-cyan-400/10 via-zinc-700/80 to-violet-400/10" />
          <div className="relative space-y-3">
            {utterances.map((utterance, index) => (
              <div className="relative pl-8" key={utterance.id}>
                <span className="absolute left-[14px] top-7 h-2.5 w-2.5 rounded-full border border-cyan-300/40 bg-zinc-950 shadow-[0_0_20px_rgba(34,211,238,0.24)]" />
                <DebateRoundCard
                  agentVisualsById={agentVisualsById}
                  index={index + 1}
                  onSelect={onSelect}
                  utterance={utterance}
                  utteranceById={utteranceById}
                />
              </div>
            ))}
          </div>
          {activeRound.status === "running" ? (
            <div className="flex items-center justify-center gap-2 py-5 text-xs text-zinc-500">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              토론 진행 중...
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DebateRoundCard({
  utterance,
  utteranceById,
  index,
  onSelect,
  agentVisualsById,
}: {
  utterance: Stage3DebateUtteranceView;
  utteranceById: Map<string, Stage3DebateUtteranceView>;
  index: number;
  onSelect?: (utterance: Stage3DebateUtteranceView) => void;
  agentVisualsById: Record<string, { avatarDataUrl?: string }>;
}) {
  const parent = utterance.parentUtteranceId
    ? utteranceById.get(utterance.parentUtteranceId)
    : undefined;
  const acceptedCount = utterance.acceptedBy?.length ?? 0;
  const rejectedCount = utterance.rejectedBy?.length ?? 0;
  const evidenceCount = utterance.evidenceRefIds?.length ?? 0;
  const codingCount = utterance.codingImpactRefs?.length ?? 0;
  const isDecision = Boolean(utterance.decisionId);
  const hasProvenance =
    parent || acceptedCount > 0 || rejectedCount > 0 || evidenceCount > 0 || codingCount > 0 || isDecision;
  const tone = roleTones[utterance.agentRole] ?? fallbackTone;
  const time = new Date(utterance.createdAt).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <article
      className={cn("group relative", onSelect && "cursor-pointer")}
      onClick={() => onSelect?.(utterance)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect?.(utterance);
        }
      }}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
    >
      {isDecision ? (
        <div className="absolute -inset-px rounded-2xl bg-gradient-to-r from-violet-500/25 via-cyan-500/20 to-violet-500/25 blur-sm" />
      ) : null}
      <div
        className={cn(
          "relative flex gap-3 rounded-2xl border bg-zinc-900/60 p-4 shadow-xl backdrop-blur-xl transition-all",
          "border-white/10 hover:border-white/20 hover:bg-zinc-900/80",
          tone.glow,
          isDecision && "ring-1 ring-violet-400/30",
        )}
      >
        <div className={cn("w-1 shrink-0 rounded-full border", tone.bar)} />
        <div className="min-w-0 flex-1 space-y-3">
          <header className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div className={cn("rounded-xl border p-1", tone.accent)}>
                <AvatarWithStatus
                  initials={utterance.agentName.slice(0, 2).toUpperCase()}
                  roleColor={roleColorFromRole(utterance.agentRole)}
                  avatarDataUrl={agentVisualsById[utterance.agentId]?.avatarDataUrl}
                  size="sm"
                />
              </div>
              <div className="min-w-0">
                <div className={cn("truncate text-sm font-semibold", tone.text)}>
                  {utterance.agentName}
                </div>
                <div className="truncate text-[10px] uppercase tracking-[0.18em] text-zinc-600">
                  {utterance.agentRole}
                </div>
              </div>
              {isDecision ? (
                <StatusBadge variant="primary" size="sm" className="gap-1 font-mono">
                  <GitMerge className="h-2.5 w-2.5" />
                  결정
                </StatusBadge>
              ) : null}
            </div>
            <span className="shrink-0 font-mono text-[10px] text-zinc-600">{time}</span>
          </header>

          {parent ? (
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <CornerDownRight className="h-3 w-3" />
              <span>
                <span className="text-zinc-300">{parent.agentName}</span>의 {parent.roundTitle} 발언에 응답
              </span>
            </div>
          ) : null}

          {utterance.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {utterance.tags.map((tag) => (
                <TagPill key={tag} tag={tag} />
              ))}
            </div>
          ) : null}

          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
            {utterance.content}
          </p>

          {hasProvenance ? (
            <div className="flex flex-wrap gap-2 border-t border-white/[0.07] pt-3">
              {acceptedCount > 0 ? (
                <Pill
                  icon={<CheckCircle2 className="h-3 w-3" />}
                  label={`수용 ${acceptedCount}`}
                  tone="success"
                  tooltip={resolveNameList(utterance.acceptedBy, utteranceById)}
                />
              ) : null}
              {rejectedCount > 0 ? (
                <Pill
                  icon={<XCircle className="h-3 w-3" />}
                  label={`기각 ${rejectedCount}`}
                  tone="destructive"
                  tooltip={resolveNameList(utterance.rejectedBy, utteranceById)}
                />
              ) : null}
              {evidenceCount > 0 ? (
                <Pill
                  icon={<Link2 className="h-3 w-3" />}
                  label={`근거 ${evidenceCount}`}
                  tone="muted"
                  tooltip={utterance.evidenceRefIds?.join(" · ")}
                />
              ) : null}
              {codingCount > 0 ? (
                <Pill
                  icon={<Code2 className="h-3 w-3" />}
                  label={`코딩 ${codingCount}`}
                  tone="primary"
                  tooltip={utterance.codingImpactRefs?.join(" · ")}
                />
              ) : null}
              {isDecision ? (
                <Pill
                  icon={<GitMerge className="h-3 w-3" />}
                  label={utterance.decisionId ?? "decision"}
                  tone="primary"
                  tooltip="이 발언이 최종 결정 노드로 채택됨"
                />
              ) : null}
            </div>
          ) : null}

          <footer className="flex items-center justify-between text-[10px] text-zinc-600">
            <span>Round {index}</span>
            <span>{utterance.roundTitle}</span>
          </footer>
        </div>
      </div>
    </article>
  );
}

function TagPill({ tag }: { tag: DebateTag }) {
  const styles: Record<DebateTag, string> = {
    agreement: "bg-emerald-500/15 text-emerald-300",
    objection: "bg-amber-500/15 text-amber-300",
    evidence: "bg-cyan-500/15 text-cyan-300",
    risk: "bg-rose-500/15 text-rose-300",
    coding_impact: "bg-violet-500/15 text-violet-300",
  };
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", styles[tag])}>
      {debateTagLabel(tag)}
    </span>
  );
}

function Pill({
  icon,
  label,
  tone,
  tooltip,
}: {
  icon: ReactNode;
  label: string;
  tone: "success" | "destructive" | "muted" | "primary";
  tooltip?: string;
}) {
  const variant =
    tone === "success" ? "success"
    : tone === "destructive" ? "danger"
    : tone === "primary" ? "primary"
    : "muted";

  return (
    <span title={tooltip}>
      <StatusBadge variant={variant} size="sm" className="gap-1 font-mono">
        {icon}
        {label}
      </StatusBadge>
    </span>
  );
}

function ConsensusSummary({
  roundStatus,
  utterances,
}: {
  roundStatus: Stage3DebateSession["rounds"][number]["status"];
  utterances: Stage3DebateUtteranceView[];
}) {
  const stats = useMemo(() => {
    let agreements = 0;
    let objections = 0;
    let risks = 0;
    let decisions = 0;
    for (const utterance of utterances) {
      if (utterance.tags.includes("agreement")) agreements += 1;
      if (utterance.tags.includes("objection")) objections += 1;
      if (utterance.tags.includes("risk")) risks += 1;
      if (utterance.decisionId) decisions += 1;
    }
    return { agreements, decisions, objections, risks, total: utterances.length };
  }, [utterances]);
  const consensusLevel = stats.total === 0
    ? "none"
    : stats.agreements / stats.total >= 0.7
      ? "high"
      : stats.agreements / stats.total >= 0.4
        ? "medium"
        : "low";

  return (
    <div className="relative z-10 shrink-0 border-t border-white/10 bg-zinc-950/80 px-4 py-3 backdrop-blur-xl md:px-6">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <StatItem icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="합의" tone="success" value={stats.agreements} />
          <StatItem icon={<XCircle className="h-3.5 w-3.5" />} label="반대" tone="warning" value={stats.objections} />
          <StatItem icon={<AlertCircle className="h-3.5 w-3.5" />} label="리스크" tone="danger" value={stats.risks} />
          <StatItem icon={<GitMerge className="h-3.5 w-3.5" />} label="결정" tone="primary" value={stats.decisions} />
        </div>
        <div className="flex items-center gap-2">
          {roundStatus === "running" ? (
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-300">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              진행 중
            </span>
          ) : roundStatus === "completed" ? (
            <span className="flex items-center gap-1.5 rounded-full bg-white/[0.05] px-2 py-1 text-xs font-medium text-zinc-400">
              <Clock3 className="h-3 w-3" />
              완료
            </span>
          ) : null}
          <ConsensusIndicator level={consensusLevel} />
        </div>
      </div>
    </div>
  );
}

function StatItem({
  icon,
  label,
  tone,
  value,
}: {
  icon: ReactNode;
  label: string;
  tone: "success" | "warning" | "danger" | "primary";
  value: number;
}) {
  const styles = {
    danger: "text-rose-300",
    primary: "text-cyan-300",
    success: "text-emerald-300",
    warning: "text-amber-300",
  };
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("opacity-75", styles[tone])}>{icon}</span>
      <span className="text-zinc-500">{label}</span>
      <span className={cn("font-medium tabular-nums", styles[tone])}>{value}</span>
    </div>
  );
}

function ConsensusIndicator({ level }: { level: "none" | "low" | "medium" | "high" }) {
  const config = {
    high: { label: "높음", style: "bg-emerald-500/15 text-emerald-300" },
    low: { label: "낮음", style: "bg-rose-500/15 text-rose-300" },
    medium: { label: "보통", style: "bg-amber-500/15 text-amber-300" },
    none: { label: "-", style: "bg-white/[0.05] text-zinc-500" },
  };
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-600">합의도</span>
      <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-medium", config[level].style)}>
        {config[level].label}
      </span>
    </div>
  );
}

function DebateAnnex({
  entries,
  isOpen,
  items,
  onClose,
}: {
  entries: HumanPeekEntry[];
  isOpen: boolean;
  items: StatusHubItem[];
  onClose: () => void;
}) {
  return (
    <>
      {isOpen ? (
        <button
          aria-label="Debate Inspector 닫기"
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          type="button"
        />
      ) : null}
      <aside
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-white/10 bg-zinc-950/95 shadow-2xl shadow-black/60 backdrop-blur-xl transition-transform duration-300",
          isOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <FileSearch className="h-4 w-4 text-cyan-300" />
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">Debate Inspector</h2>
              <p className="text-[11px] text-zinc-600">잡다한 상태 정보와 릴레이 로그</p>
            </div>
          </div>
          <button
            aria-label="Debate Inspector 닫기"
            className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-white/10 hover:text-zinc-200"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          <AnnexSection
            description="세션 상태 및 시스템 메트릭"
            icon={<Activity className="h-4 w-4" />}
            title="Status Hub"
          >
            <div className="space-y-2">
              {items.length > 0 ? (
                items.map((item) => <StatusHubRow item={item} key={item.id} />)
              ) : (
                <p className="text-xs text-zinc-500">상태 정보 없음</p>
              )}
            </div>
          </AnnexSection>
          <AnnexSection
            description="비공개 에이전트 흐름"
            icon={<Eye className="h-4 w-4" />}
            title="Agent Relay"
          >
            <div className="space-y-2">
              {entries.length > 0 ? (
                entries.map((entry) => <AgentRelayRow entry={entry} key={entry.id} />)
              ) : (
                <p className="text-xs text-zinc-500">비공개 흐름 없음</p>
              )}
            </div>
          </AnnexSection>
          <AnnexSection
            description="본문 토론 목적과 떨어진 보조 근거"
            icon={<Inbox className="h-4 w-4" />}
            title="Evidence References"
          >
            <p className="text-xs leading-relaxed text-zinc-500">
              발언 카드를 선택하면 관련 Evidence, coding impact, rejected option을 이 보조 창으로 승격할 수 있습니다.
            </p>
          </AnnexSection>
        </div>
      </aside>
    </>
  );
}

function AnnexSection({
  children,
  description,
  icon,
  title,
}: {
  children: ReactNode;
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-start gap-2">
        <span className="text-zinc-500">{icon}</span>
        <div>
          <h3 className="text-sm font-medium text-zinc-200">{title}</h3>
          <p className="text-[11px] text-zinc-600">{description}</p>
        </div>
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-xl">
        {children}
      </div>
    </section>
  );
}

function StatusHubRow({ item }: { item: StatusHubItem }) {
  const toneStyles = {
    danger: "text-rose-300",
    ok: "text-emerald-300",
    warn: "text-amber-300",
  };
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.06] py-1.5 last:border-0">
      <span className="text-xs text-zinc-500">{item.label}</span>
      <span className={cn("font-mono text-xs", toneStyles[item.tone])}>{item.value}</span>
    </div>
  );
}

function AgentRelayRow({ entry }: { entry: HumanPeekEntry }) {
  return (
    <div className="space-y-1 rounded-xl border border-white/[0.07] bg-black/20 p-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wide text-cyan-300">
          {entry.kind}
        </span>
        <span className="text-[10px] text-zinc-600">
          {new Date(entry.createdAt).toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-zinc-300">{entry.actor}</span>
        <ArrowRight className="h-3 w-3 text-zinc-600" />
        <span className="text-zinc-500">{entry.target}</span>
      </div>
      <p className="line-clamp-2 text-[11px] text-zinc-500">{entry.summary}</p>
    </div>
  );
}

function resolveNameList(
  ids: DebateUtterance["acceptedBy"] | DebateUtterance["rejectedBy"],
  utteranceById: Map<string, Stage3DebateUtteranceView>,
): string | undefined {
  if (!ids || ids.length === 0) return undefined;
  return ids
    .map((id) => {
      const utterance = utteranceById.get(id);
      return utterance ? `${utterance.agentName} (${utterance.roundTitle})` : id;
    })
    .join(" · ");
}

function debateTagLabel(tag: DebateTag) {
  const labels: Record<DebateTag, string> = {
    agreement: "합의",
    objection: "반대",
    evidence: "근거",
    risk: "리스크",
    coding_impact: "코딩 영향",
  };
  return labels[tag];
}
