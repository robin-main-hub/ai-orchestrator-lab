import type { TmuxPaneRole } from "@ai-orchestrator/protocol";
import { compactPublicText, sanitizePublicText } from "./publicRedaction";

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

export function formatTmuxPaneSurfaceLabel(paneId: string) {
  const match = /^pane-(\d+)$/.exec(paneId);
  if (!match) {
    if (/^(role|agent|session|terminal)[\s:_-]/i.test(paneId) || /[\s:_-](role|agent|session|terminal)$/i.test(paneId)) {
      return "작업창 기타";
    }
    const safePaneLabel = compactPublicText(
      sanitizePublicText(paneId).replace(/[:_]+/g, " ").replace(/\s+/g, " ").trim(),
      24,
    );
    return safePaneLabel ? `작업창 ${safePaneLabel}` : "작업창";
  }
  return `작업창 ${Number(match[1]) + 1}`;
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
    blocked: "차단됨",
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
  return sanitizePublicText(value);
}

export function compactTmuxPreview(value: string, maxLength = 240) {
  return compactPublicText(value, maxLength);
}
