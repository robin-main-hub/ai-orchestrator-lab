import type { AgentProfile } from "@ai-orchestrator/protocol";
import {
  createAgentChannelRecallQuery,
  type AgentChannelMemoryScope,
} from "./agentConversationChannels";
import { createAgentToolRuntimeSummary, getAgentToolBadgeLabels, getAgentToolProfile } from "./agentToolProfiles";
import { agentRoleLabel, formatModelDisplayName, providerDisplayLabel } from "./helpers";
import { resolveOperatorWorkerDisplay } from "./operatorWorkerDisplay";

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
  providerProfileId?: string;
};

function createMemoryValue(adapterStatus: AgentConversationFlowInput["adapterStatus"], memoryRecordCount: number) {
  if (adapterStatus === "error") return "수동 확인 필요";
  if (adapterStatus === "loading") return "기억 준비 중";
  return `${memoryRecordCount}개 기억 후보`;
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
  providerProfileId,
}: AgentConversationFlowInput): AgentConversationFlowCard[] {
  const toolProfile = getAgentToolProfile(agent.role);
  const agentDisplay = resolveOperatorWorkerDisplay({ role: agent.role, workerId: agent.id });
  const providerLabel = createProviderConnectionLabel(providerProfileId ?? memoryScope?.providerProfileId);
  const scopeLabel = memoryScope ? "이 대화방 전용 기억 범위" : "수동 기억 범위";
  const recallQuery = memoryScope ? createAgentChannelRecallQuery(memoryScope, `${agent.name} ${agent.role} conversation`) : undefined;

  return [
    {
      id: "channel",
      label: "개인 채널",
      value: `${agentDisplay.displayName} 전용 대화방`,
      details: [
        `맡은 자리: ${agentDisplay.roleLabel || agentRoleLabel(agent.role)}`,
        `모델 연결: ${providerLabel}`,
        `모델: ${formatModelDisplayName(modelId)}`,
      ],
      tone: "ready",
    },
    {
      id: "memory",
      label: "EvolveMemento",
      value: createMemoryValue(adapterStatus, memoryRecordCount),
      details: [
        scopeLabel,
        `${memoryRecordCount}개 기억 조회 후보`,
        recallQuery ? "대화 맥락 기반 기억 조회 준비" : "수동 기억 조회 대기",
        "기억 원문은 채팅 화면에 직접 노출하지 않음",
        "신뢰된 연결이 아니면 장기 기억 자동 주입은 수동 확인",
      ],
      tone: createMemoryTone(adapterStatus),
    },
    {
      id: "tools",
      label: toolProfile.label,
      value: `${toolProfile.tools.length}개 도구 프로필`,
      details: [
        getAgentToolBadgeLabels(agent.role)[0] ?? "도구 준비",
        createToolBoundaryDetail(toolProfile.tools),
        ...getAgentToolBadgeLabels(agent.role).slice(0, 4),
        "도구 호출 전 목적·입력·권한을 먼저 요약",
      ],
      tone: "ready",
    },
    {
      id: "trace",
      label: "공개 작업 로그",
      value: "단계·도구·검증 표시",
      details: [
        "숨은 사고 과정은 노출하지 않음",
        "작업 단계, 도구 후보, 검증 요약만 채팅에 표시",
      ],
      tone: "manual",
    },
  ];
}

function createProviderConnectionLabel(providerProfileId?: string) {
  if (!providerProfileId) return "모델 연결 대기";
  return providerDisplayLabel(providerProfileId.replace(/^provider[_-]?/i, "").replace(/_/g, " "));
}

function createToolBoundaryDetail(tools: string[]) {
  const runtime = createAgentToolRuntimeSummary(tools);
  return runtime.approvalRequiredCount > 0
    ? `승인 경계 ${runtime.approvalRequiredCount}개`
    : runtime.boundaryLabel;
}
