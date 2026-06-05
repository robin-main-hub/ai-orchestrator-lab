import type { TmuxPaneRole } from "@ai-orchestrator/protocol";

export type TmuxWorkbenchDifficulty = "light" | "standard" | "complex" | "critical";

export const tmuxWorkbenchCopy = {
  gatedNotice: "승인 게이트 준비됨. 실제 전송은 승인 이후에만 실행됩니다.",
  kicker: "터미널 작업대",
  recommendationLabel: "작업 배치 추천",
} as const;

const roleLabels: Record<TmuxPaneRole, string> = {
  architect: "설계",
  backend: "백엔드",
  code: "코드",
  discussion: "논의",
  frontend: "프론트",
  memory: "기억",
  orchestrator: "지휘",
  qa: "검증",
  research: "조사",
  status: "상태",
};

export function tmuxPaneRoleLabel(role: TmuxPaneRole) {
  return roleLabels[role] ?? role;
}

export function formatTmuxPaneCountLabel(count: number) {
  return `패널 ${count}개`;
}

export function formatTmuxDifficultyLabel(difficulty: TmuxWorkbenchDifficulty) {
  if (difficulty === "critical") return "고위험";
  if (difficulty === "complex") return "복합";
  if (difficulty === "standard") return "표준";
  return "경량";
}

export function tmuxPaneStateLabel(state: string) {
  const labels: Record<string, string> = {
    active: "활성",
    "capture failed": "읽기 실패",
    captured: "읽음",
    capturing: "읽는 중",
    "chat active": "대화 중",
    "dispatch failed": "전송 실패",
    "dispatch gated": "승인 필요",
    dispatching: "전송 중",
    failed: "실패",
    guarding: "감시 중",
    idle: "대기",
    pending_approval: "승인 대기",
    ready: "준비",
    recommended: "추천",
    standby: "대기",
    "watch only": "감시 전용",
  };
  return labels[state] ?? state;
}

export function sanitizeTmuxWorkbenchText(value: string) {
  return value
    .replace(/(?:chain[- ]of[- ]thought|raw prompt|tool input|command args?)\s*:[^\n\r]*/gi, "[redacted:internal]")
    .replace(/https?:\/\/[^\s"')]+/gi, "[redacted:url]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[redacted]")
    .replace(/tp-[A-Za-z0-9_-]{8,}/g, "[redacted]")
    .replace(/\b[A-Za-z0-9_]*(?:TOKEN|SECRET|API_KEY|PASSWORD)[A-Za-z0-9_]*=[^\s]+/gi, "[redacted]")
    .replace(/\/Users\/[^\s"')]+/g, "[redacted:path]");
}

export function compactTmuxPreview(value: string, maxLength = 240) {
  const sanitized = sanitizeTmuxWorkbenchText(value).replace(/\s+/g, " ").trim();
  if (sanitized.length <= maxLength) return sanitized;
  return `${sanitized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
