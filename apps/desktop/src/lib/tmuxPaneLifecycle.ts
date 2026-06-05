import type { TerminalTimelineBlock } from "@ai-orchestrator/protocol";

export type TmuxPaneLifecycleTone = "ok" | "warn" | "danger" | "idle";

export type TmuxPaneLifecycleSummary = {
  detail: string;
  failedCount: number;
  lastBlockLabel: string;
  pendingApprovalCount: number;
  tone: TmuxPaneLifecycleTone;
};

export function deriveTmuxPaneLifecycleSummary({
  lastOutput,
  paneState,
  timelineBlocks,
}: {
  lastOutput?: string;
  paneState: string;
  timelineBlocks: TerminalTimelineBlock[];
}): TmuxPaneLifecycleSummary {
  const pendingApprovalCount = timelineBlocks.filter((block) => block.status === "pending_approval").length;
  const failedCount = timelineBlocks.filter((block) => block.status === "failed" || block.status === "blocked").length;
  const lastBlock = timelineBlocks.at(-1);

  if (failedCount > 0 || /failed|blocked|guarding/i.test(paneState)) {
    return {
      detail: lastBlock?.summary ?? lastOutput ?? "실패 또는 차단 상태를 확인하세요.",
      failedCount,
      lastBlockLabel: lastBlock ? `${kindLabel(lastBlock.kind)} / ${statusLabel(lastBlock.status)}` : paneState,
      pendingApprovalCount,
      tone: "danger",
    };
  }

  if (pendingApprovalCount > 0 || /pending|gated|dispatching|capture/i.test(paneState)) {
    return {
      detail: lastBlock?.summary ?? lastOutput ?? "승인 또는 서버 응답을 기다리는 중입니다.",
      failedCount,
      lastBlockLabel: lastBlock ? `${kindLabel(lastBlock.kind)} / ${statusLabel(lastBlock.status)}` : paneState,
      pendingApprovalCount,
      tone: "warn",
    };
  }

  if (lastBlock?.status === "completed" || /active|ready|captured|recorded/i.test(paneState)) {
    return {
      detail: lastBlock?.summary ?? lastOutput ?? "최근 실행/캡처가 정상 상태입니다.",
      failedCount,
      lastBlockLabel: lastBlock ? `${kindLabel(lastBlock.kind)} / ${statusLabel(lastBlock.status)}` : paneState,
      pendingApprovalCount,
      tone: "ok",
    };
  }

  return {
    detail: lastBlock?.summary ?? lastOutput ?? "아직 실행 기록이 없습니다.",
    failedCount,
    lastBlockLabel: lastBlock ? `${kindLabel(lastBlock.kind)} / ${statusLabel(lastBlock.status)}` : paneState,
    pendingApprovalCount,
    tone: "idle",
  };
}

function kindLabel(kind: TerminalTimelineBlock["kind"]) {
  const labels: Record<TerminalTimelineBlock["kind"], string> = {
    approval: "승인",
    capture: "캡처",
    command_intent: "의도",
    dispatch: "전송",
    dry_run: "리허설",
    handoff: "인계",
    note: "노트",
    planning: "계획",
  };
  return labels[kind];
}

function statusLabel(status: TerminalTimelineBlock["status"]) {
  const labels: Record<TerminalTimelineBlock["status"], string> = {
    blocked: "차단",
    completed: "완료",
    dry_run: "리허설",
    failed: "실패",
    pending_approval: "승인 대기",
    planned: "계획",
    running: "실행 중",
    stale: "오래됨",
  };
  return labels[status];
}
