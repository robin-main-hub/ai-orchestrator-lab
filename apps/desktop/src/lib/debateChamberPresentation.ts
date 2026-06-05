import type { AgentProfile } from "@ai-orchestrator/protocol";

export type DebateStance = "agree" | "disagree" | "risk" | "evidence" | "decision" | "neutral";
export type DebateRoundStatus = "blocked" | "complete" | "completed" | "pending" | "running";
export type AnnexTabKey = "status" | "evidence" | "agents" | "memory" | "queue" | "logs";

type Tone = {
  bg: string;
  border?: string;
  color?: string;
  text?: string;
};

export const debateChamberCopy = {
  annexButton: "보조자료",
  applyPacket: "패킷 반영",
  emptyRound: "이 라운드에 발언이 없습니다",
  kicker: "토론실",
  timelineLabel: "토론 타임라인",
} as const;

export const annexCopy = {
  kicker: "토론 보조자료",
} as const;

export const annexTabPresentation: Record<AnnexTabKey, { label: string }> = {
  agents: { label: "에이전트 흐름" },
  evidence: { label: "근거" },
  logs: { label: "로그" },
  memory: { label: "기억" },
  queue: { label: "대기열" },
  status: { label: "상태" },
};

export function formatAnnexTabLabel(label: string, count: number): string {
  const safeLabel = sanitizeDebateAnnexText(label.trim() || "보조자료");
  if (!Number.isFinite(count) || count <= 0) return safeLabel;
  return `${safeLabel} ${Math.min(Math.floor(count), 99)}`;
}

export function createAnnexTabCountSummary(counts: Record<AnnexTabKey, number>): string {
  const order: AnnexTabKey[] = ["status", "evidence", "agents", "memory", "queue", "logs"];
  const active = order
    .map((key) => [key, counts[key]] as const)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => formatAnnexTabLabel(annexTabPresentation[key].label, count));
  return active.length > 0 ? `보조자료 ${active.join(" · ")}` : "보조자료 없음";
}

const stanceTones: Record<DebateStance, Tone> = {
  agree: { bg: "bg-violet-500/10", color: "text-violet-300" },
  decision: { bg: "bg-violet-500/10", color: "text-violet-400" },
  disagree: { bg: "bg-rose-500/10", color: "text-rose-400" },
  evidence: { bg: "bg-blue-500/10", color: "text-blue-300" },
  neutral: { bg: "bg-zinc-500/10", color: "text-zinc-400" },
  risk: { bg: "bg-amber-500/10", color: "text-amber-400" },
};

const roleTones: Partial<Record<AgentProfile["role"], Tone>> = {
  architect: { bg: "bg-violet-500/10", border: "border-violet-500/30", text: "text-violet-300" },
  builder: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-300" },
  executor: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-300" },
  memory_curator: { bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-300" },
  orchestrator: { bg: "bg-violet-500/10", border: "border-violet-500/30", text: "text-violet-300" },
  reviewer: { bg: "bg-rose-500/10", border: "border-rose-500/30", text: "text-rose-300" },
  skeptic: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-300" },
  verifier: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-300" },
};

export function debateStanceTone(stance: DebateStance) {
  return stanceTones[stance];
}

export function debateRoleTone(role: AgentProfile["role"]) {
  return roleTones[role] ?? { bg: "bg-zinc-500/10", border: "border-zinc-500/30", text: "text-zinc-300" };
}

export function formatDebateFooterMeta({
  participantCount,
  readiness,
  roundStatus,
}: {
  participantCount: number;
  readiness: string;
  roundStatus: DebateRoundStatus;
}) {
  return `참여자 ${participantCount}명 · ${roundStatusLabel(roundStatus)} · ${readiness}`;
}

export function roundStatusLabel(status: DebateRoundStatus) {
  if (status === "complete" || status === "completed") return "완료";
  if (status === "running") return "진행 중";
  if (status === "blocked") return "차단";
  return "대기";
}

export function sanitizeDebateAnnexText(value: string) {
  return value
    .replace(/(?:chain[- ]of[- ]thought|raw prompt|tool input|command args?)\s*:[^\n\r]*/gi, "[redacted:internal]")
    .replace(/https?:\/\/[^\s"')]+/gi, "[redacted:url]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[redacted]")
    .replace(/tp-[A-Za-z0-9_-]{8,}/g, "[redacted]")
    .replace(/\b[A-Za-z0-9_]*(?:TOKEN|SECRET|API_KEY|PASSWORD)[A-Za-z0-9_]*=[^\s]+/gi, "[redacted]")
    .replace(/\/Users\/[^\s"')]+/g, "[redacted:path]");
}
