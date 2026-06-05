export type AgentMemoryQualityAdapterStatus = "error" | "loading" | "ready";

export type AgentMemoryQualityTone = "ready" | "warming" | "attention";

export type AgentMemoryQualityState =
  | "building"
  | "empty"
  | "error"
  | "healthy"
  | "loading";

export type AgentMemoryQualityInput = {
  adapterStatus: AgentMemoryQualityAdapterStatus;
  memoryRecordCount: number;
  messageCount: number;
};

export type AgentMemoryQuality = {
  label: string;
  shortLabel: string;
  state: AgentMemoryQualityState;
  tone: AgentMemoryQualityTone;
};

export function createAgentMemoryQuality({
  adapterStatus,
  memoryRecordCount,
  messageCount,
}: AgentMemoryQualityInput): AgentMemoryQuality {
  if (adapterStatus === "error") {
    return {
      label: "장기 기억 점검 필요",
      shortLabel: "장기 기억 점검 필요",
      state: "error",
      tone: "attention",
    };
  }
  if (adapterStatus === "loading") {
    return {
      label: "장기 기억 불러오는 중",
      shortLabel: "장기 기억 로딩",
      state: "loading",
      tone: "warming",
    };
  }
  if (memoryRecordCount >= 3 && messageCount >= 2) {
    return {
      label: "장기 기억 품질 양호",
      shortLabel: "장기 기억 품질 양호",
      state: "healthy",
      tone: "ready",
    };
  }
  if (memoryRecordCount > 0 || messageCount > 0) {
    return {
      label: "장기 기억 축적 중",
      shortLabel: "장기 기억 축적 중",
      state: "building",
      tone: "warming",
    };
  }
  return {
    label: "장기 기억 새로 시작",
    shortLabel: "장기 기억 시작 전",
    state: "empty",
    tone: "warming",
  };
}
