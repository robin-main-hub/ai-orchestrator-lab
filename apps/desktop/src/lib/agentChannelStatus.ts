export type AgentChannelAdapterStatus = "loading" | "ready" | "error";

export type AgentChannelStatusInput = {
  agentName?: string;
  adapterStatus: AgentChannelAdapterStatus;
  memoryRecordCount: number;
  messageCount: number;
};

export type AgentChannelStatus = {
  title: string;
  continuityLabel: string;
  memoryLabel: string;
  tone: AgentChannelAdapterStatus;
};

export function createAgentChannelStatus({
  agentName,
  adapterStatus,
  memoryRecordCount,
  messageCount,
}: AgentChannelStatusInput): AgentChannelStatus {
  const displayName = agentName?.trim() || "선택 에이전트";

  return {
    title: `${displayName} 전용 채널`,
    continuityLabel: messageCount > 0 ? `이전 대화 이어받음 · ${messageCount}개 메시지` : "새 대화 시작",
    memoryLabel: createMemoryLabel(adapterStatus, memoryRecordCount),
    tone: adapterStatus,
  };
}

function createMemoryLabel(adapterStatus: AgentChannelAdapterStatus, memoryRecordCount: number): string {
  if (adapterStatus === "loading") {
    return "기억 조회 중";
  }
  if (adapterStatus === "error") {
    return "기억 연결 확인 필요";
  }
  return memoryRecordCount > 0 ? `기억 ${memoryRecordCount}개 적용` : "기억 대기";
}
