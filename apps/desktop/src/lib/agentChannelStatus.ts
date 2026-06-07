import type { AgentChannelMemoryScope } from "./agentConversationChannels";
import { compactPublicText, sanitizePublicText } from "./publicRedaction";

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
      value: sanitizeChannelValue(`전용 기억 · ${shortSessionLabel(memoryScope.sessionId)}`),
    });
    chips.push({
      label: "기억 추적",
      tone: "ready",
      value: memoryScope.recallTraceId ? "recall 추적 준비됨" : "recall 추적 대기",
    });
  }
  if (providerProfileId || modelId) {
    chips.push({
      label: "공급자",
      tone: "ready",
      value: sanitizeChannelValue([providerDisplayName(providerProfileId), modelId].filter(Boolean).join(" · ")),
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

export function createAgentChannelHeaderMemoryLabel(memoryScope?: AgentChannelMemoryScope): string | undefined {
  if (!memoryScope) return undefined;
  return sanitizeChannelValue(`기억 ${shortSessionLabel(memoryScope.sessionId)}`);
}

function sanitizeChannelValue(value: string): string {
  return compactPublicText(sanitizePublicText(value), 42);
}

function shortSessionLabel(sessionId?: string): string {
  if (!sessionId) return "세션";
  return sessionId
    .replace(/^session_/, "")
    .replace(/^desktop_/, "desk-")
    .replace(/_/g, "-");
}

function providerDisplayName(providerProfileId?: string): string | undefined {
  if (!providerProfileId) return undefined;
  const value = providerProfileId.split(/\s+/)[0]?.toLowerCase() ?? "";
  if (value.includes("mimo")) return "MiMo";
  if (value.includes("apifun") || value.includes("apikeyfun")) return "APIKey.fun";
  if (value.includes("openai")) return "OpenAI";
  if (value.includes("ollama")) return "Ollama";
  if (value.includes("vllm")) return "vLLM";
  return "공급자 연결됨";
}
