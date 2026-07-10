import type { AgentActivityStatus } from "../types";

export type AgentThinkingIndicator = {
  status: Exclude<AgentActivityStatus, "idle">;
  label: string;
  narration: string;
  steps: AgentThinkingStep[];
};

export type AgentThinkingStep = {
  label: string;
  state: "active" | "done" | "pending";
};

/**
 * Decides whether the conversation thread should show a live "the agent is
 * working on a reply" affordance for the currently selected agent.
 *
 * The activity state machine drives avatar status dots, but those only attach
 * to messages that are already in the thread. On the first turn — or any time
 * the selected agent has not yet posted — the user gets no feedback while a
 * multi-step completion, tool scan, tmux read, dispatch, or approval wait is in
 * flight. This surfaces that state at the bottom of the thread so the
 * workbench reads as a live operator surface, not a static mockup.
 *
 * Returns null when there is no selected agent or it is idle.
 */
export function resolveAgentThinkingIndicator(
  selectedAgentId: string | undefined,
  agentActivityById: Record<string, AgentActivityStatus> | undefined,
): AgentThinkingIndicator | null {
  if (!selectedAgentId) return null;
  const activity = agentActivityById?.[selectedAgentId] ?? "idle";
  if (activity === "preparing") {
    return {
      status: "preparing",
      label: "잠깐 방향 잡는 중",
      narration: "요청을 쪼개고, 필요한 기억과 도구 후보를 고르는 중입니다.",
      steps: [
        { label: "요청 읽기", state: "active" },
        { label: "기억·도구 고르기", state: "pending" },
        { label: "답변 경로 정하기", state: "pending" },
      ],
    };
  }
  if (activity === "responding") {
    return {
      status: "responding",
      label: "답변을 함께 다듬는 중",
      narration: "확인 가능한 내용과 다음 행동만 남기며 답변을 정리하고 있습니다.",
      steps: [
        { label: "응답 초안 받음", state: "done" },
        { label: "맥락·권한 점검", state: "active" },
        { label: "대화에 남길 요약 정리", state: "pending" },
      ],
    };
  }
  if (activity === "tooling") {
    return {
      status: "tooling",
      label: "도구 후보를 고르는 중",
      narration: "목적, 입력, 권한 경계를 맞추고 어떤 도구를 부를지 점검하고 있습니다.",
      steps: [
        { label: "목적 확인", state: "done" },
        { label: "도구 후보 점검", state: "active" },
        { label: "권한 경계 확인", state: "pending" },
      ],
    };
  }
  if (activity === "capturing") {
    return {
      status: "capturing",
      label: "작업창을 읽는 중",
      narration: "터미널 출력과 최근 작업 흔적을 가져와 대화에 붙일 단서를 정리하고 있습니다.",
      steps: [
        { label: "작업창 선택", state: "done" },
        { label: "출력 읽기", state: "active" },
        { label: "요약 정리", state: "pending" },
      ],
    };
  }
  if (activity === "dispatching") {
    return {
      status: "dispatching",
      label: "명령을 전달하는 중",
      narration: "승인된 명령을 안전한 작업창으로 넘기고 결과 기록을 기다리고 있습니다.",
      steps: [
        { label: "승인 확인", state: "done" },
        { label: "명령 전달", state: "active" },
        { label: "결과 기록", state: "pending" },
      ],
    };
  }
  if (activity === "testing") {
    return {
      status: "testing",
      label: "검증을 돌리는 중",
      narration: "수정 결과를 믿을 수 있게 테스트와 빌드 신호를 확인하고 있습니다.",
      steps: [
        { label: "변경점 고정", state: "done" },
        { label: "테스트 실행", state: "active" },
        { label: "결과 브리핑 정리", state: "pending" },
      ],
    };
  }
  if (activity === "waiting_approval") {
    return {
      status: "waiting_approval",
      label: "운영자 승인을 기다리는 중",
      narration: "위험한 실행은 멈춰 두고, 승인 대기열에서 필요한 근거를 보여주는 중입니다.",
      steps: [
        { label: "위험 감지", state: "done" },
        { label: "승인 대기", state: "active" },
        { label: "승인 후 재개", state: "pending" },
      ],
    };
  }
  if (activity === "error") {
    return {
      status: "error",
      label: "막힌 원인을 정리하는 중",
      narration: "실패 지점을 공개 요약으로 남기고, 다음에 복구할 단서를 분리하고 있습니다.",
      steps: [
        { label: "실패 감지", state: "done" },
        { label: "원인 요약", state: "active" },
        { label: "복구 후보", state: "pending" },
      ],
    };
  }
  return null;
}
