import type { AgentChannelAdapterStatus } from "./agentChannelStatus";

export type AgentChatContinuitySummaryInput = {
  adapterStatus: AgentChannelAdapterStatus;
  agentName?: string;
  memoryRecordCount: number;
  messageCount: number;
  toolLabels?: string[];
};

export type AgentChatContinuitySummary = {
  detail: string;
  placeholder: string;
  title: string;
};

export function createAgentChatContinuitySummary({
  adapterStatus,
  agentName,
  memoryRecordCount,
  messageCount,
  toolLabels = [],
}: AgentChatContinuitySummaryInput): AgentChatContinuitySummary {
  const safeAgentName = sanitizeContinuityText(agentName?.trim() || "선택 에이전트");
  const safeToolLabels = toolLabels.map(sanitizeContinuityText).filter(Boolean).slice(0, 3);
  const memoryLabel =
    adapterStatus === "loading"
      ? "기억 조회 중"
      : adapterStatus === "error"
        ? "기억 연결 확인 필요"
        : memoryRecordCount > 0
          ? `기억 ${memoryRecordCount}개 적용`
          : "기억 대기";
  const conversationLabel =
    messageCount > 0
      ? `${messageCount}개 메시지`
      : "첫 메시지를 보내면 전용 채널에 저장됩니다";
  const toolLabel = safeToolLabels.length > 0 ? `도구: ${safeToolLabels.join(", ")}` : "도구 준비 대기";

  return {
    detail: [memoryLabel, conversationLabel, toolLabel].join(" · "),
    placeholder: messageCount > 0 ? `${safeAgentName}에게 이어서 말 걸기` : `${safeAgentName}에게 말 걸기`,
    title: messageCount > 0 ? `${safeAgentName}와 이어서 대화` : `${safeAgentName}와 새 대화`,
  };
}

function sanitizeContinuityText(value: string): string {
  return value
    .replace(/https?:\/\/[^\s"')]+/gi, "[redacted:url]")
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[redacted]")
    .replace(/tp-[A-Za-z0-9_-]{8,}/g, "[redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi, "Bearer [redacted]")
    .replace(/\b[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|COOKIE)[A-Z0-9_]*\s*=\s*["']?[^\s"']+["']?/g, "[redacted]");
}
