export type AgentConversationReadinessTone = "ready" | "warming" | "attention";

export type AgentConversationReadinessInput = {
  adapterStatus: "error" | "loading" | "ready";
  agentId?: string;
  memoryRecordCount: number;
  messageCount: number;
  toolCount: number;
};

export type AgentConversationReadiness = {
  checks: string[];
  label: string;
  memoryQualityLabel: string;
  tone: AgentConversationReadinessTone;
};

export function createAgentConversationReadiness({
  adapterStatus,
  agentId,
  memoryRecordCount,
  messageCount,
  toolCount,
}: AgentConversationReadinessInput): AgentConversationReadiness {
  const checks: string[] = [];
  const memoryQualityLabel = createMemoryQualityLabel({ adapterStatus, memoryRecordCount, messageCount });
  if (agentId?.trim()) {
    checks.push("전용 채널");
  }
  if (toolCount > 0) {
    checks.push(`도구 ${toolCount}개`);
  }
  if (adapterStatus === "ready" && memoryRecordCount > 0) {
    checks.push(`기억 ${memoryRecordCount}개`);
  }
  if (messageCount > 0) {
    checks.push(`대화 ${messageCount}개`);
  }

  if (adapterStatus === "error") {
    return {
      checks,
      label: "기억 연결 확인 필요",
      memoryQualityLabel,
      tone: "attention",
    };
  }

  if (!agentId?.trim() || toolCount === 0) {
    return {
      checks,
      label: "에이전트 준비 확인 필요",
      memoryQualityLabel,
      tone: "attention",
    };
  }

  if (adapterStatus === "loading") {
    return {
      checks,
      label: "기억 조회 중",
      memoryQualityLabel,
      tone: "warming",
    };
  }

  if (memoryRecordCount === 0 && messageCount === 0) {
    return {
      checks,
      label: "첫 대화 준비됨",
      memoryQualityLabel,
      tone: "warming",
    };
  }

  return {
    checks,
    label: "연속 대화 준비됨",
    memoryQualityLabel,
    tone: "ready",
  };
}

function createMemoryQualityLabel({
  adapterStatus,
  memoryRecordCount,
  messageCount,
}: {
  adapterStatus: AgentConversationReadinessInput["adapterStatus"];
  memoryRecordCount: number;
  messageCount: number;
}) {
  if (adapterStatus === "error") return "장기 기억 점검 필요";
  if (adapterStatus === "loading") return "장기 기억 로딩";
  if (memoryRecordCount >= 3 && messageCount >= 2) return "장기 기억 품질 양호";
  if (memoryRecordCount > 0 || messageCount > 0) return "장기 기억 축적 중";
  return "장기 기억 시작 전";
}
