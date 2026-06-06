import type { TerminalTimelineBlock } from "@ai-orchestrator/protocol";

export type TmuxRecoveryState = "healthy" | "needs_approval" | "needs_capture" | "retryable" | "manual_intervention";

export type TmuxRecoveryPlan = {
  canRetry: boolean;
  primaryAction: string;
  reason: string;
  state: TmuxRecoveryState;
};

export type TmuxRecoveryPlanInput = {
  lastCaptureAt?: string;
  now?: string;
  paneState: string;
  staleAfterMs?: number;
  timelineBlocks: TerminalTimelineBlock[];
};

const DEFAULT_STALE_AFTER_MS = 3 * 60 * 1000;

export function deriveTmuxRecoveryPlan({
  lastCaptureAt,
  now = new Date().toISOString(),
  paneState,
  staleAfterMs = DEFAULT_STALE_AFTER_MS,
  timelineBlocks,
}: TmuxRecoveryPlanInput): TmuxRecoveryPlan {
  const pendingApproval = [...timelineBlocks].reverse().find((block) => block.status === "pending_approval");
  if (pendingApproval) {
    return {
      canRetry: false,
      primaryAction: "승인 대기열 확인",
      reason: pendingApproval.summary ?? "위험 실행은 운영자 승인 후 전송됩니다.",
      state: "needs_approval",
    };
  }

  const failed = [...timelineBlocks].reverse().find((block) => block.status === "failed" || block.status === "blocked");
  if (failed || /failed|blocked|error/i.test(paneState)) {
    return {
      canRetry: true,
      primaryAction: "마지막 명령 재실행 준비",
      reason: failed?.summary ?? "pane 상태가 실패 또는 차단으로 표시됩니다.",
      state: "retryable",
    };
  }

  if (isStale(lastCaptureAt, now, staleAfterMs)) {
    return {
      canRetry: false,
      primaryAction: "pane 출력 재캡처",
      reason: "최근 캡처가 오래되어 현재 pane 상태를 다시 확인해야 합니다.",
      state: "needs_capture",
    };
  }

  if (timelineBlocks.length === 0) {
    return {
      canRetry: false,
      primaryAction: "첫 실행 대기",
      reason: "아직 실행 timeline이 없습니다.",
      state: "manual_intervention",
    };
  }

  return {
    canRetry: false,
    primaryAction: "상태 유지",
    reason: "최근 tmux timeline이 정상 범위입니다.",
    state: "healthy",
  };
}

function isStale(lastCaptureAt: string | undefined, now: string, staleAfterMs: number): boolean {
  if (!lastCaptureAt) return false;
  const capture = Date.parse(lastCaptureAt);
  const current = Date.parse(now);
  if (!Number.isFinite(capture) || !Number.isFinite(current)) return false;
  return current - capture > staleAfterMs;
}
