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
      tone: "attention",
    };
  }

  if (!agentId?.trim() || toolCount === 0) {
    return {
      checks,
      label: "에이전트 준비 확인 필요",
      tone: "attention",
    };
  }

  if (adapterStatus === "loading") {
    return {
      checks,
      label: "기억 조회 중",
      tone: "warming",
    };
  }

  if (memoryRecordCount === 0 && messageCount === 0) {
    return {
      checks,
      label: "첫 대화 준비됨",
      tone: "warming",
    };
  }

  return {
    checks,
    label: "연속 대화 준비됨",
    tone: "ready",
  };
}
