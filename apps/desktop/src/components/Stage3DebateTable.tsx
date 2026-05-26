import { useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  CornerDownRight,
  FileText,
  GitMerge,
  Link2,
  Send,
  Users,
  XCircle,
} from "lucide-react";
import type { DebateTag, DebateUtterance } from "@ai-orchestrator/protocol";
import type { Stage3DebateSession } from "../runtime/stage3Runtime";
import type { Stage3DebateUtteranceView } from "../types";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";

/**
 * Stage 3 Debate Table — strict v0 port.
 *
 * source: docs/v0/v0-output/components/debate/*
 *
 * v0 layout:
 *   <flex h-full flex-col>
 *     <DebateContextHeader>      title + 패킷반영 button + stage tabs
 *     <flex flex-1>
 *       <flex-1 border-r>        2-col grid of DebateRoundCard
 *       <w-80 right side>        StatusHub + Agent Relay (collapsible)
 *
 * 모든 prop / callback 보존. design-decisions §7 의 provenance 시각화
 * (parent/accepted/rejected/decision/evidence/coding) 는 round card
 * footer 에 carry — v0 row 구조 안에 chip strip 으로.
 */

export function Stage3DebateTable({
  onCreateCodingPacket,
  onSelectUtterance,
  session,
}: {
  onCreateCodingPacket: () => void;
  onSelectUtterance?: (utterance: Stage3DebateUtteranceView) => void;
  session: Stage3DebateSession;
}) {
  const utterances: Stage3DebateUtteranceView[] = useMemo(
    () =>
      session.rounds.flatMap((round) =>
        round.utterances.map((utterance) => ({
          ...utterance,
          roundTitle: round.title,
          agentName:
            session.participants.find((p) => p.agentId === utterance.agentId)?.name ??
            utterance.agentId,
        })),
      ),
    [session.rounds, session.participants],
  );

  const utteranceById = useMemo(() => {
    const map = new Map<string, Stage3DebateUtteranceView>();
    for (const u of utterances) map.set(u.id, u);
    return map;
  }, [utterances]);

  const currentRound =
    session.rounds.find((r) => r.status === "running") ?? session.rounds[0];

  return (
    <section className="flex h-full flex-col bg-background" aria-label="Debate">
      {/* ── Header: context + stage tabs ───────────────────────── */}
      <DebateContextHeader
        currentRoundId={currentRound?.id}
        onCreateCodingPacket={onCreateCodingPacket}
        rounds={session.rounds}
        session={session}
      />

      {/* ── Main: rounds (left, grid) + side panel (right) ─────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: debate rounds grid */}
        <div className="flex-1 overflow-y-auto border-r border-border">
          <div className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-2">
            {utterances.map((utterance, index) => (
              <DebateRoundCard
                index={index + 1}
                key={utterance.id}
                onSelect={onSelectUtterance}
                utterance={utterance}
                utteranceById={utteranceById}
              />
            ))}
          </div>
        </div>

        {/* Right: status hub + agent relay */}
        <div className="flex w-80 shrink-0 flex-col overflow-y-auto">
          <div className="space-y-4 p-4">
            <StatusHub items={session.statusHub} />
            <AgentRelay entries={session.humanPeek} />
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Header ───────────────────────────────────────────────────────────

function DebateContextHeader({
  currentRoundId,
  onCreateCodingPacket,
  rounds,
  session,
}: {
  currentRoundId?: string;
  onCreateCodingPacket: () => void;
  rounds: Stage3DebateSession["rounds"];
  session: Stage3DebateSession;
}) {
  return (
    <div className="shrink-0 border-b border-border bg-card/30">
      {/* Title row */}
      <div className="flex items-start gap-4 border-b border-border/50 px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <FileText className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Debate Context
          </span>
          <h2 className="mt-1 truncate text-sm font-semibold text-foreground">
            {session.problem}
          </h2>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {session.summary}
          </p>
        </div>
        <Button
          className="shrink-0 gap-2"
          onClick={onCreateCodingPacket}
          size="sm"
          variant="outline"
        >
          <FileText className="h-3.5 w-3.5" />
          패킷 반영
        </Button>
      </div>

      {/* Stage tabs */}
      <div className="flex items-center gap-1 overflow-x-auto px-4 py-2">
        {rounds.map((round) => {
          const isActive = round.id === currentRoundId;
          const isCompleted = round.status === "completed";
          return (
            <button
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                isActive
                  ? "bg-primary/15 text-primary"
                  : isCompleted
                    ? "text-muted-foreground hover:bg-card/60 hover:text-foreground"
                    : "text-muted-foreground/50 hover:bg-card/60 hover:text-muted-foreground",
              )}
              key={round.id}
              type="button"
            >
              {round.title}
              {isActive ? (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Round card ───────────────────────────────────────────────────────

function DebateRoundCard({
  utterance,
  utteranceById,
  index,
  onSelect,
}: {
  utterance: Stage3DebateUtteranceView;
  utteranceById: Map<string, Stage3DebateUtteranceView>;
  index: number;
  onSelect?: (utterance: Stage3DebateUtteranceView) => void;
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

  const time = new Date(utterance.createdAt).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border bg-card transition-colors",
        onSelect && "cursor-pointer hover:border-primary/40",
        isDecision ? "border-primary/50" : "border-border",
      )}
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
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/15 text-[11px] font-semibold text-primary">
            {utterance.agentName.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">
              {utterance.agentName}
            </div>
            <div className="truncate text-[10px] text-muted-foreground">
              {utterance.roundTitle}
            </div>
          </div>
        </div>
        {isDecision ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-mono text-primary">
            <GitMerge className="h-2.5 w-2.5" />
            DECISION
          </span>
        ) : null}
      </div>

      {parent ? (
        <div className="flex items-center gap-1.5 border-b border-border/50 px-3 py-1.5 text-[10px] text-muted-foreground">
          <CornerDownRight className="h-2.5 w-2.5" />
          <span>
            <span className="font-medium text-foreground">{parent.agentName}</span>의{" "}
            {parent.roundTitle} 발언에 응답
          </span>
        </div>
      ) : null}

      {/* Tags */}
      {utterance.tags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1 border-b border-border/50 px-3 py-1.5">
          {utterance.tags.map((tag) => (
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-1.5 py-0 text-[9px] font-mono",
                tagToneClasses(tag),
              )}
              key={tag}
            >
              {debateTagLabel(tag)}
            </span>
          ))}
        </div>
      ) : null}

      {/* Content */}
      <p className="flex-1 px-3 py-2.5 text-sm leading-relaxed text-foreground line-clamp-4">
        {utterance.content}
      </p>

      {/* Provenance pills */}
      {hasProvenance ? (
        <div className="flex flex-wrap gap-1 border-t border-border/50 px-3 py-1.5">
          {acceptedCount > 0 ? (
            <Pill
              icon={<CheckCircle2 className="h-2.5 w-2.5" />}
              label={`수용 ${acceptedCount}`}
              tone="success"
              tooltip={resolveNameList(utterance.acceptedBy, utteranceById)}
            />
          ) : null}
          {rejectedCount > 0 ? (
            <Pill
              icon={<XCircle className="h-2.5 w-2.5" />}
              label={`기각 ${rejectedCount}`}
              tone="destructive"
              tooltip={resolveNameList(utterance.rejectedBy, utteranceById)}
            />
          ) : null}
          {evidenceCount > 0 ? (
            <Pill
              icon={<Link2 className="h-2.5 w-2.5" />}
              label={`근거 ${evidenceCount}`}
              tone="muted"
              tooltip={utterance.evidenceRefIds?.join(" · ")}
            />
          ) : null}
          {codingCount > 0 ? (
            <Pill
              icon={<Send className="h-2.5 w-2.5" />}
              label={`코딩 ${codingCount}`}
              tone="primary"
              tooltip={utterance.codingImpactRefs?.join(" · ")}
            />
          ) : null}
          {isDecision ? (
            <Pill
              icon={<GitMerge className="h-2.5 w-2.5" />}
              label={utterance.decisionId ?? "decision"}
              tone="primary"
              tooltip="이 발언이 최종 결정 노드로 채택됨"
            />
          ) : null}
        </div>
      ) : null}

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border/50 px-3 py-1.5 text-[10px] text-muted-foreground">
        <span>Round {index}</span>
        <span>{time}</span>
      </div>
    </div>
  );
}

function Pill({
  icon,
  label,
  tone,
  tooltip,
}: {
  icon: React.ReactNode;
  label: string;
  tone: "success" | "destructive" | "muted" | "primary";
  tooltip?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border bg-card/40 px-1.5 py-0 text-[9px] font-mono",
        tone === "success" && "border-success/45 text-success",
        tone === "destructive" && "border-destructive/45 text-destructive",
        tone === "primary" && "border-primary/45 text-primary",
        tone === "muted" && "border-border text-muted-foreground",
      )}
      title={tooltip}
    >
      {icon}
      {label}
    </span>
  );
}

// ── Right side panel: Status Hub ────────────────────────────────────

function StatusHub({ items }: { items: Stage3DebateSession["statusHub"] }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-2">
        <span className="text-xs font-medium text-foreground">Status Hub</span>
      </div>
      <div className="grid grid-cols-2 gap-2 p-3">
        {items.map((item) => (
          <div
            className="rounded-md border border-border bg-card/40 px-3 py-2"
            key={item.id}
          >
            <span className="text-[10px] text-muted-foreground">{item.label}</span>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  item.tone === "ok" && "bg-success",
                  item.tone === "warn" && "bg-warning",
                  item.tone === "danger" && "bg-destructive",
                )}
              />
              <span
                className={cn(
                  "text-sm font-medium",
                  item.tone === "ok" && "text-success",
                  item.tone === "warn" && "text-warning",
                  item.tone === "danger" && "text-destructive",
                )}
              >
                {item.value}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Right side panel: Agent Relay ───────────────────────────────────

function AgentRelay({
  entries,
}: {
  entries: Stage3DebateSession["humanPeek"];
}) {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between border-b border-border px-4 py-2 hover:bg-card/60"
        onClick={() => setIsOpen((o) => !o)}
        type="button"
      >
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium text-foreground">Agent Relay</span>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            !isOpen && "-rotate-90",
          )}
        />
      </button>
      {isOpen ? (
        <div className="space-y-2 p-3">
          {entries.length === 0 ? (
            <p className="px-2 py-1 text-[10px] text-muted-foreground">
              비공개 에이전트 흐름 없음.
            </p>
          ) : (
            entries.map((entry) => (
              <div
                className="rounded-md border border-border bg-card/40 p-2"
                key={entry.id}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-medium",
                      entry.kind === "send" || entry.kind === "spawn"
                        ? "bg-primary/15 text-primary"
                        : entry.kind === "approval"
                          ? "bg-warning/15 text-warning"
                          : "bg-card/60 text-muted-foreground",
                    )}
                  >
                    {entry.kind}
                  </span>
                  <span className="text-xs font-medium text-foreground">
                    {entry.actor}
                  </span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs font-medium text-foreground">
                    {entry.target}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {entry.summary}
                </p>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

// ── Label helpers ───────────────────────────────────────────────────

function resolveNameList(
  ids: DebateUtterance["acceptedBy"] | DebateUtterance["rejectedBy"],
  utteranceById: Map<string, Stage3DebateUtteranceView>,
): string | undefined {
  if (!ids || ids.length === 0) return undefined;
  return ids
    .map((id) => {
      const u = utteranceById.get(id);
      return u ? `${u.agentName} (${u.roundTitle})` : id;
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

function tagToneClasses(tag: DebateTag): string {
  switch (tag) {
    case "agreement":
      return "border-success/45 text-success";
    case "objection":
      return "border-destructive/45 text-destructive";
    case "evidence":
      return "border-primary/45 text-primary";
    case "risk":
      return "border-destructive/45 text-destructive";
    case "coding_impact":
      return "border-warning/45 text-warning";
    default:
      return "border-border text-muted-foreground";
  }
}
