import type { MemoryRecord, MemoryStats } from "@ai-orchestrator/protocol";
import {
  createAgentChannelMemoryInstallSummary,
  type AgentChannelMemoryInstallAudit,
  type AgentChannelMemoryScope,
} from "./agentConversationChannels";

export type MemoryGovernanceSummary = {
  activeCount: number;
  controls: string[];
  currentScopeLabel: string;
  healthLabel: string;
  installLabel: string;
  pinnedCount: number;
  quarantinedCount: number;
  status: "ready" | "attention" | "error";
  tombstonedCount: number;
  totalRecords: number;
};

export type MemoryGovernanceInput = {
  adapterStatus: "loading" | "ready" | "error";
  installAudit: AgentChannelMemoryInstallAudit;
  records: MemoryRecord[];
  scope?: AgentChannelMemoryScope;
  stats: MemoryStats;
};

export function createMemoryGovernanceSummary({
  adapterStatus,
  installAudit,
  records,
  scope,
  stats,
}: MemoryGovernanceInput): MemoryGovernanceSummary {
  const installHealthy =
    installAudit.installedCount === installAudit.totalAgents &&
    installAudit.missingAgentIds.length === 0 &&
    installAudit.duplicateNamespaceAgentIds.length === 0 &&
    installAudit.duplicateRecallTraceAgentIds.length === 0;
  const status = adapterStatus === "error" ? "error" : installHealthy && stats.health === "good" ? "ready" : "attention";

  return {
    activeCount: stats.activeRecords,
    controls: ["현재 맥락 기억", "기록 관리", "기억 고정", "기억 활성화", "기억 삭제"],
    currentScopeLabel: scope ? `에이전트 ${scope.agentId} / 세션 ${scope.sessionId}` : "선택된 에이전트 없음",
    healthLabel: healthLabelFor(stats.health, adapterStatus),
    installLabel: createAgentChannelMemoryInstallSummary(installAudit),
    pinnedCount: stats.pinnedRecords,
    quarantinedCount: stats.quarantinedRecords,
    status,
    tombstonedCount: records.filter((record) => Boolean(record.tombstonedAt)).length,
    totalRecords: stats.totalRecords,
  };
}

function healthLabelFor(health: MemoryStats["health"], adapterStatus: "loading" | "ready" | "error") {
  if (adapterStatus === "error") {
    return "기억 어댑터 오류";
  }
  if (adapterStatus === "loading") {
    return "기억 불러오는 중";
  }
  if (health === "good") {
    return "기억 상태 정상";
  }
  if (health === "watch") {
    return "기억 상태 주시";
  }
  return "기억 검토 필요";
}
