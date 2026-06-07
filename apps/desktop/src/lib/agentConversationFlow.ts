import type { AgentProfile } from "@ai-orchestrator/protocol";
import {
  createAgentChannelRecallQuery,
  type AgentChannelMemoryScope,
} from "./agentConversationChannels";
import { createAgentToolRuntimeSummary, getAgentToolBadgeLabels, getAgentToolProfile } from "./agentToolProfiles";
import { agentRoleLabel, formatModelDisplayName, providerDisplayLabel } from "./helpers";
import { resolveOperatorWorkerDisplay } from "./operatorWorkerDisplay";
import { compactPublicText, sanitizePublicText } from "./publicRedaction";

export type AgentConversationFlowTone = "ready" | "manual" | "error";

export type AgentConversationFlowCard = {
  id: "channel" | "memory" | "tools" | "trace";
  label: string;
  value: string;
  details: string[];
  tone: AgentConversationFlowTone;
};

export type AgentConversationFlowInput = {
  agent: Pick<AgentProfile, "id" | "name" | "role">;
  adapterStatus: "loading" | "ready" | "error";
  memoryRecordCount: number;
  memoryScope?: AgentChannelMemoryScope;
  modelId?: string;
  modelName?: string;
  providerProfileId?: string;
  providerName?: string;
};

function createMemoryValue(adapterStatus: AgentConversationFlowInput["adapterStatus"], memoryRecordCount: number) {
  if (adapterStatus === "error") return "기억은 함께 확인 필요";
  if (adapterStatus === "loading") return "기억 단서 고르는 중";
  return `${memoryRecordCount}개 기억 단서 준비`;
}

function createMemoryTone(adapterStatus: AgentConversationFlowInput["adapterStatus"]): AgentConversationFlowTone {
  if (adapterStatus === "error") return "error";
  if (adapterStatus === "loading") return "manual";
  return "ready";
}

export function createAgentConversationFlowCards({
  agent,
  adapterStatus,
  memoryRecordCount,
  memoryScope,
  modelId,
  modelName,
  providerProfileId,
  providerName,
}: AgentConversationFlowInput): AgentConversationFlowCard[] {
  const toolProfile = getAgentToolProfile(agent.role);
  const agentDisplay = resolveOperatorWorkerDisplay({ role: agent.role, workerId: agent.id });
  const providerConnection = createProviderConnectionDetail(providerName, providerProfileId ?? memoryScope?.providerProfileId);
  const modelLabel = formatModelDisplayName(modelName ?? modelId);
  const roomLabel = memoryScope?.roomLabel ?? "이 대화방";
  const scopeLabel = memoryScope ? `${roomLabel} 기억만 참고` : "수동 기억 확인 대기";
  const recallQuery = memoryScope ? createAgentChannelRecallQuery(memoryScope, `${agent.name} ${agent.role} conversation`) : undefined;

  return [
    {
      id: "channel",
      label: "동료 채널",
      value: `${agentDisplay.displayName}와 1:1로 이어짐`,
      details: [
        `맡은 자리: ${agentDisplay.roleLabel || agentRoleLabel(agent.role)}`,
        memoryScope?.roomLabel ?? "전용 방 준비 중",
        providerConnection,
        `${modelLabel}로 대화`,
      ],
      tone: "ready",
    },
    {
      id: "memory",
      label: "기억 연결",
      value: createMemoryValue(adapterStatus, memoryRecordCount),
      details: [
        scopeLabel,
        `${memoryRecordCount}개 기억 후보를 고름`,
        recallQuery ? "대화 맥락 기반 기억 조회 준비" : "수동 기억 조회 대기",
        "필요한 단서만 답변에 반영",
        "장기 기억 자동 주입은 신뢰 상태에 맞춰 조심스럽게 처리",
      ],
      tone: createMemoryTone(adapterStatus),
    },
    {
      id: "tools",
      label: toolProfile.label,
      value: `${toolProfile.tools.length}개 협업 도구 준비`,
      details: [
        getAgentToolBadgeLabels(agent.role)[0] ?? "도구 준비",
        createToolBoundaryDetail(toolProfile.tools),
        ...getAgentToolBadgeLabels(agent.role).slice(0, 4),
        "호출 전 목적·입력·권한을 먼저 맞춤",
      ],
      tone: "ready",
    },
    {
      id: "trace",
      label: "작업 공유",
      value: "진행 상황만 또렷하게 공유",
      details: [
        "숨은 사고 과정은 노출하지 않음",
        "작업 단계, 도구 후보, 검증 요약만 대화에 표시",
      ],
      tone: "manual",
    },
  ];
}

function createProviderConnectionDetail(providerName?: string, providerProfileId?: string) {
  const safeProviderName = providerName?.trim();
  if (safeProviderName) {
    return `${compactPublicText(providerDisplayLabel(sanitizePublicText(safeProviderName)), 32)} 연결`;
  }
  if (!providerProfileId) return "모델 연결 대기";
  return "공급자 연결됨";
}

function createToolBoundaryDetail(tools: string[]) {
  const runtime = createAgentToolRuntimeSummary(tools);
  return runtime.approvalRequiredCount > 0
    ? `승인 경계 ${runtime.approvalRequiredCount}개`
    : runtime.boundaryLabel;
}
