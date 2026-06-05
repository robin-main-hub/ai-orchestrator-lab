import type { AgentChannelMemoryScope } from "./agentConversationChannels";

export type AgentChannelAdapterStatus = "loading" | "ready" | "error";

export type AgentChannelStatusInput = {
  agentName?: string;
  roleLabel?: string;
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

export type AgentChannelDetailChip = {
  label: string;
  tone: AgentChannelAdapterStatus;
  value: string;
};

export type AgentChannelDetailChipInput = {
  memoryScope?: AgentChannelMemoryScope;
  modelId?: string;
  providerProfileId?: string;
  toolLabels?: string[];
};

export function createAgentChannelStatus({
  agentName,
  roleLabel,
  adapterStatus,
  memoryRecordCount,
  messageCount,
}: AgentChannelStatusInput): AgentChannelStatus {
  const displayName = agentName?.trim() || "선택 에이전트";
  const identityTitle = roleLabel?.trim() ? `${displayName} · ${sanitizeChannelValue(roleLabel)}` : `${displayName} 전용 채널`;

  return {
    title: identityTitle,
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

export function createAgentChannelDetailChips({
  memoryScope,
  modelId,
  providerProfileId,
  toolLabels = [],
}: AgentChannelDetailChipInput): AgentChannelDetailChip[] {
  const chips: AgentChannelDetailChip[] = [];
  if (memoryScope) {
    chips.push({
      label: "기억 범위",
      tone: "ready",
      value: sanitizeChannelValue(`${memoryScope.agentId} · ${memoryScope.sessionId}`),
    });
    chips.push({
      label: "기억 추적",
      tone: "ready",
      value: compactChannelValue(memoryScope.recallTraceId),
    });
  }
  if (providerProfileId || modelId) {
    chips.push({
      label: "Provider",
      tone: "ready",
      value: sanitizeChannelValue([providerProfileId, modelId].filter(Boolean).join(" · ")),
    });
  }
  if (toolLabels.length > 0) {
    chips.push({
      label: "도구 프로필",
      tone: "ready",
      value: sanitizeChannelValue(toolLabels.slice(0, 3).join(" · ")),
    });
  }
  return chips;
}

function sanitizeChannelValue(value: string): string {
  return value
    .replace(/https?:\/\/[^\s"')]+/gi, "[redacted:url]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[redacted]")
    .replace(/\btp-[A-Za-z0-9_-]{8,}\b/g, "[redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi, "Bearer [redacted]")
    .replace(/\b[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|COOKIE)[A-Z0-9_]*\s*=\s*["']?[^\s"']+["']?/g, "[redacted]");
}

function compactChannelValue(value: string): string {
  const sanitized = sanitizeChannelValue(value);
  if (sanitized.length <= 48) return sanitized;
  return `${sanitized.slice(0, 28)}…${sanitized.slice(-18)}`;
}
