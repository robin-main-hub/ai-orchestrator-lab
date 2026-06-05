import type { AgentChannelAdapterStatus } from "./agentChannelStatus";
import { sanitizePublicText } from "./publicRedaction";

export type AgentChatContinuitySummaryInput = {
  adapterStatus: AgentChannelAdapterStatus;
  agentName?: string;
  memoryRecordCount: number;
  messageCount: number;
  toolLabels?: string[];
};

export type AgentChatContinuitySummary = {
  detail: string;
  memoryQualityLabel: string;
  memoryQualityTone: "ready" | "warming" | "attention";
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
  const memoryQuality = createMemoryQuality({ adapterStatus, memoryRecordCount, messageCount });

  return {
    detail: [memoryLabel, conversationLabel, toolLabel].join(" · "),
    memoryQualityLabel: memoryQuality.label,
    memoryQualityTone: memoryQuality.tone,
    placeholder: messageCount > 0 ? `${safeAgentName}에게 이어서 말 걸기` : `${safeAgentName}에게 말 걸기`,
    title: messageCount > 0 ? `${safeAgentName}와 이어서 대화` : `${safeAgentName}와 새 대화`,
  };
}

function createMemoryQuality({
  adapterStatus,
  memoryRecordCount,
  messageCount,
}: {
  adapterStatus: AgentChannelAdapterStatus;
  memoryRecordCount: number;
  messageCount: number;
}) {
  if (adapterStatus === "error") {
    return { label: "장기 기억 점검 필요", tone: "attention" as const };
  }
  if (adapterStatus === "loading") {
    return { label: "장기 기억 불러오는 중", tone: "warming" as const };
  }
  if (memoryRecordCount >= 3 && messageCount >= 2) {
    return { label: "장기 기억 품질 양호", tone: "ready" as const };
  }
  if (memoryRecordCount > 0 || messageCount > 0) {
    return { label: "장기 기억 축적 중", tone: "warming" as const };
  }
  return { label: "장기 기억 새로 시작", tone: "warming" as const };
}

function sanitizeContinuityText(value: string): string {
  return sanitizePublicText(value);
}
