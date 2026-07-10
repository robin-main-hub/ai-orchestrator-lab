import type { AgentProfile } from "@ai-orchestrator/protocol";
import { sanitizePublicText } from "./publicRedaction";

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

// Tone maps use the v2 token vocabulary (spec §2.2: main-surface tones → the accent
// system; §1.1 single-accent = emerald). Each legacy literal hue maps to its semantic
// token (F2 precedent, U12): agree/decision + orchestrator-family → primary (accent),
// opposition/reviewer → destructive, risk/skeptic → warning, evidence/neutral/builder →
// muted (neutral·info). Opacities (/10 fill, /30 border) are preserved from the source
// so visual weight is unchanged. Cast role differentiation moves to avatars and
// role-glow (DEB-3, U4) — chrome stays single-accent here.
const stanceTones: Record<DebateStance, Tone> = {
  agree: { bg: "bg-primary/10", color: "text-primary" },
  decision: { bg: "bg-primary/10", color: "text-primary" },
  disagree: { bg: "bg-destructive/10", color: "text-destructive" },
  evidence: { bg: "bg-muted/10", color: "text-muted-foreground" },
  neutral: { bg: "bg-muted/10", color: "text-muted-foreground" },
  risk: { bg: "bg-warning/10", color: "text-warning" },
};

const roleTones: Partial<Record<AgentProfile["role"], Tone>> = {
  architect: { bg: "bg-primary/10", border: "border-primary/30", text: "text-primary" },
  builder: { bg: "bg-muted/10", border: "border-muted/30", text: "text-muted-foreground" },
  executor: { bg: "bg-warning/10", border: "border-warning/30", text: "text-warning" },
  memory_curator: { bg: "bg-primary/10", border: "border-primary/30", text: "text-primary" },
  orchestrator: { bg: "bg-primary/10", border: "border-primary/30", text: "text-primary" },
  reviewer: { bg: "bg-destructive/10", border: "border-destructive/30", text: "text-destructive" },
  skeptic: { bg: "bg-warning/10", border: "border-warning/30", text: "text-warning" },
  verifier: { bg: "bg-muted/10", border: "border-muted/30", text: "text-muted-foreground" },
};

export function debateStanceTone(stance: DebateStance) {
  return stanceTones[stance];
}

export function debateRoleTone(role: AgentProfile["role"]) {
  return roleTones[role] ?? { bg: "bg-muted/10", border: "border-muted/30", text: "text-muted-foreground" };
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
  return sanitizePublicText(value);
}
