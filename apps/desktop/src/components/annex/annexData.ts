import { useEffect, useState } from "react";
import type { RuntimeSnapshot } from "@ai-orchestrator/protocol";
import { sanitizeDebateAnnexText } from "@/lib/annexPresentation";
import { deriveDebateDecisionReadiness } from "../../lib/debateDecisionReadiness";
import type { Stage3DebateSession } from "../../runtime/stage3Runtime";

export type StatusItem = {
  id: string;
  label: string;
  status?: "critical" | "degraded" | "healthy";
  value: string | number;
};

export type EvidenceRef = {
  id: string;
  relevance: "high" | "low" | "medium";
  source: string;
  title: string;
};

export type QueueItem = {
  id: string;
  status: "pending" | "ready" | "waiting";
  timestamp: string;
  title: string;
  type: "approval" | "draft" | "task";
};

export type LogEntry = {
  id: string;
  level: "error" | "info" | "warn";
  message: string;
  timestamp: string;
};

export type ActivityEntry = {
  id: string;
  tone: "info" | "warn" | "error";
  primary: string;
  secondary?: string;
  timestamp: string;
};

export type MemoryRecall = {
  confidence: number;
  key: string;
  value: string;
};

export function buildStatusItems(session: Stage3DebateSession, runtime: RuntimeSnapshot): StatusItem[] {
  const readiness = deriveDebateDecisionReadiness(session);
  return [
    ...session.statusHub.map((item) => ({
      id: item.id,
      label: sanitizeDebateAnnexText(item.label),
      status:
        item.tone === "danger"
          ? ("critical" as const)
          : item.tone === "warn"
            ? ("degraded" as const)
            : ("healthy" as const),
      value: sanitizeDebateAnnexText(String(item.value)),
    })),
    {
      id: "decision-readiness",
      label: "결정 준비",
      status:
        readiness.state === "blocked"
          ? ("critical" as const)
          : readiness.state === "needs_review"
            ? ("degraded" as const)
            : ("healthy" as const),
      value: sanitizeDebateAnnexText(readiness.headline),
    },
    {
      id: "authority",
      label: "기준 권한",
      status: "healthy" as const,
      value: sanitizeDebateAnnexText(runtime.syncTopology.authorityLabel),
    },
    {
      id: "memory-sync",
      label: "기억 동기화",
      status:
        runtime.memorySyncStatus === "online" || runtime.memorySyncStatus === "syncing"
          ? ("healthy" as const)
          : ("degraded" as const),
      value: formatRuntimeStatusLabel(runtime.memorySyncStatus),
    },
  ];
}

export function buildEvidenceRefs(session: Stage3DebateSession): EvidenceRef[] {
  const refs = new Map<string, EvidenceRef>();
  for (const round of session.rounds) {
    for (const utterance of round.utterances) {
      for (const id of utterance.evidenceRefIds ?? []) {
        refs.set(id, {
          id,
          relevance: utterance.tags.includes("risk") ? "high" : "medium",
          source: sanitizeDebateAnnexText(round.title),
          title: sanitizeDebateAnnexText(id),
        });
      }
      for (const id of utterance.codingImpactRefs ?? []) {
        refs.set(id, {
          id,
          relevance: "high",
          source: `${sanitizeDebateAnnexText(round.title)} · 코딩 영향`,
          title: sanitizeDebateAnnexText(id),
        });
      }
      if (utterance.decisionId) {
        refs.set(utterance.decisionId, {
          id: utterance.decisionId,
          relevance: "high",
          source: `${sanitizeDebateAnnexText(round.title)} · 결정`,
          title: sanitizeDebateAnnexText(utterance.decisionId),
        });
      }
    }
  }
  return [...refs.values()];
}

export function buildQueueItems({
  codingPacketGoal,
  pendingApprovals,
}: {
  codingPacketGoal?: string;
  pendingApprovals: number;
}): QueueItem[] {
  const items: QueueItem[] = [];
  if (pendingApprovals > 0) {
    items.push({
      id: "permission-queue",
      status: "pending",
      timestamp: "지금",
      title: `승인 대기 ${pendingApprovals}건`,
      type: "approval",
    });
  }
  if (codingPacketGoal) {
    items.push({
      id: "coding-packet",
      status: "ready",
      timestamp: "준비됨",
      title: sanitizeDebateAnnexText(codingPacketGoal),
      type: "draft",
    });
  }
  return items;
}

type LogSource = {
  id: string;
  level: "error" | "info" | "warn";
  message: string;
  createdAt: string;
};

function collectLogSources(session: Stage3DebateSession, runtime: RuntimeSnapshot): LogSource[] {
  return [
    {
      id: "promoted",
      level: "info",
      message: `대화에서 토론으로 승격됨 · ${new Date(session.promotedAt).toLocaleString("ko-KR")}`,
      createdAt: session.promotedAt,
    },
    {
      id: "runtime",
      level: runtime.recentError ? "error" : "info",
      message: sanitizeDebateAnnexText(
        runtime.recentError ?? `런타임 갱신 · ${new Date(runtime.updatedAt).toLocaleString("ko-KR")}`,
      ),
      createdAt: runtime.updatedAt,
    },
    ...session.humanPeek.map((entry) => ({
      id: entry.id,
      level: entry.state === "blocked" ? ("warn" as const) : ("info" as const),
      message: sanitizeDebateAnnexText(
        `${formatAnnexActorLabel(entry.actor)} ${formatAnnexActionLabel(entry.kind)} ${formatAnnexActorLabel(entry.target)}: ${entry.summary}`,
      ),
      createdAt: entry.createdAt,
    })),
    ...session.rounds.flatMap((round) =>
      round.utterances.slice(0, 8).map((utterance) => ({
        id: `utterance-${utterance.id}`,
        level:
          utterance.tags.includes("risk") || utterance.tags.includes("objection")
            ? ("warn" as const)
            : ("info" as const),
        message: sanitizeDebateAnnexText(
          `공개 작업 로그 · ${round.title} · ${resolveDebateAnnexAgentLabel(session, utterance.agentId)}`,
        ),
        createdAt: utterance.createdAt,
      })),
    ),
  ];
}

export function buildLogs(session: Stage3DebateSession, runtime: RuntimeSnapshot, now: number): LogEntry[] {
  return collectLogSources(session, runtime).map((source) => ({
    id: source.id,
    level: source.level,
    message: source.message,
    timestamp: formatRelativeTime(source.createdAt, now),
  }));
}

export function buildActivity(
  session: Stage3DebateSession,
  runtime: RuntimeSnapshot,
  now: number,
): ActivityEntry[] {
  const rows: Array<ActivityEntry & { sortMs: number }> = [];

  for (const peek of session.humanPeek) {
    const parsed = Date.parse(peek.createdAt);
    rows.push({
      id: `relay-${peek.id}`,
      tone: peek.state === "blocked" ? "warn" : "info",
      primary: `${formatAnnexActorLabel(peek.actor)} → ${formatAnnexActorLabel(peek.target)}`,
      secondary: formatAnnexActionLabel(peek.kind),
      timestamp: formatRelativeTime(peek.createdAt, now),
      sortMs: Number.isNaN(parsed) ? 0 : parsed,
    });
  }

  for (const source of collectLogSources(session, runtime)) {
    const parsed = Date.parse(source.createdAt);
    rows.push({
      id: `log-${source.id}`,
      tone: source.level,
      primary: source.message,
      timestamp: formatRelativeTime(source.createdAt, now),
      sortMs: Number.isNaN(parsed) ? 0 : parsed,
    });
  }

  return rows
    .sort((a, b) => b.sortMs - a.sortMs)
    .map((row) => ({
      id: row.id,
      tone: row.tone,
      primary: row.primary,
      secondary: row.secondary,
      timestamp: row.timestamp,
    }));
}

export function buildMemoryRecall(session: Stage3DebateSession): MemoryRecall[] {
  return session.contextPreview.map((value, index) => ({
    confidence: Math.max(62, 94 - index * 7),
    key: `context-${index + 1}`,
    value: sanitizeDebateAnnexText(value),
  }));
}

export function resolveDebateAnnexAgentLabel(session: Stage3DebateSession, agentId: string) {
  const participant = session.participants.find((candidate) => candidate.agentId === agentId);
  if (participant?.name) return sanitizeDebateAnnexText(participant.name);
  return "알 수 없는 워커";
}

export function formatAnnexActorLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    architect: "설계자",
    builder: "구현자",
    executor: "실행자",
    orchestrator: "지휘자",
    reviewer: "검토자",
  };
  return labels[normalized] ?? sanitizeDebateAnnexText(value);
}

export function formatAnnexActionLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    approve: "승인",
    ask: "질문",
    block: "차단",
    capture: "수집",
    dispatch: "전송",
    edit: "수정",
    handoff: "인계",
    reject: "거절",
    review: "검토",
  };
  return labels[normalized] ?? sanitizeDebateAnnexText(value);
}

export function formatRuntimeStatusLabel(status: RuntimeSnapshot["memorySyncStatus"]) {
  const labels: Record<RuntimeSnapshot["memorySyncStatus"], string> = {
    degraded: "저하됨",
    offline: "오프라인",
    online: "정상",
    syncing: "동기화 중",
  };
  return labels[status] ?? sanitizeDebateAnnexText(status);
}

export function formatRelativeTime(value: string, now: number) {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return value;
  const delta = now - timestamp;
  if (delta < 60_000) return "방금";
  if (delta < 3_600_000) return `${Math.max(1, Math.floor(delta / 60_000))}분 전`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}시간 전`;
  return `${Math.floor(delta / 86_400_000)}일 전`;
}

export function useNow(updateIntervalMs = 60000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), updateIntervalMs);
    return () => clearInterval(interval);
  }, [updateIntervalMs]);
  return now;
}
