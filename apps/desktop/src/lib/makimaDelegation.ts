import type { WorkItem, WorkItemHandoff } from "@ai-orchestrator/protocol";
import type { WorkbenchAgent } from "../types";
import { agentPrimaryDisplayName } from "./agentDisplay";
import { getAgentToolProfileSummary } from "./agentToolProfiles";

export type MakimaDelegationCard = {
  id: string;
  targetAgentId: string;
  targetAgentName: string;
  targetRoleLabel: string;
  title: string;
  summary: string;
  toolLabel: string;
  toolPreview: string[];
  targetSurface: WorkItemHandoff["targetSurface"];
  priority: WorkItem["priority"];
};

const roleDelegationOrder: Array<{
  role: WorkbenchAgent["role"];
  title: string;
  summary: string;
  targetSurface: WorkItemHandoff["targetSurface"];
  priority: WorkItem["priority"];
}> = [
  {
    role: "architect",
    title: "구조 설계",
    summary: "요구사항을 시스템 경계, 데이터 흐름, 화면 책임으로 쪼개 실행 가능한 설계안을 만듭니다.",
    targetSurface: "conversation",
    priority: "high",
  },
  {
    role: "builder",
    title: "구현 착수",
    summary: "사용자가 체감할 수 있는 변경 단위를 골라 코드 수정과 화면 연결을 진행합니다.",
    targetSurface: "execution_slot",
    priority: "high",
  },
  {
    role: "reviewer",
    title: "회귀 검토",
    summary: "변경 후 깨질 수 있는 사용자 흐름과 빠진 테스트를 먼저 찾습니다.",
    targetSurface: "conversation",
    priority: "normal",
  },
  {
    role: "verifier",
    title: "검증 계획",
    summary: "타입체크, 유닛 테스트, 브라우저 확인을 어떤 순서로 볼지 검증 기준을 정리합니다.",
    targetSurface: "tmux",
    priority: "normal",
  },
  {
    role: "executor",
    title: "실행 슬롯",
    summary: "승인 후 실행할 명령, 브랜치, PR, 기록 단계를 실행 슬롯으로 정리합니다.",
    targetSurface: "execution_slot",
    priority: "high",
  },
  {
    role: "memory_curator",
    title: "기억 연결",
    summary: "이번 작업에서 장기 기억으로 남길 기준과 에이전트별 회상 단서를 정리합니다.",
    targetSurface: "conversation",
    priority: "normal",
  },
];

const roleLabelMap: Record<WorkbenchAgent["role"], string> = {
  architect: "설계자",
  auditor: "감사자",
  builder: "구현자",
  companion: "동행자",
  domain_expert: "전문가",
  executor: "실행자",
  external: "외부 연결",
  mediator: "조율자",
  memory_curator: "기억 관리자",
  negotiator: "협상가",
  orchestrator: "지휘자",
  researcher: "조사자",
  reviewer: "검토자",
  risk_officer: "위험 관리자",
  skeptic: "회의론자",
  verifier: "검증자",
  watchdog: "감시자",
};

export function createMakimaDelegationCards({
  agents,
  request,
}: {
  agents: WorkbenchAgent[];
  request: string;
}): MakimaDelegationCard[] {
  const normalizedRequest = normalizeDelegationRequest(request);
  const usedAgentIds = new Set<string>();

  return roleDelegationOrder.flatMap((template) => {
    const targetAgent = agents.find((agent) => agent.role === template.role && !usedAgentIds.has(agent.id));
    if (!targetAgent) {
      return [];
    }
    usedAgentIds.add(targetAgent.id);
    const toolProfile = getAgentToolProfileSummary(targetAgent.role);
    const targetAgentName = agentPrimaryDisplayName(targetAgent);

    return [
      {
        id: `makima_delegation_${template.role}`,
        priority: template.priority,
        summary: `${template.summary} 기준 요청: ${normalizedRequest}`,
        targetAgentId: targetAgent.id,
        targetAgentName,
        targetRoleLabel: roleLabelMap[targetAgent.role] ?? targetAgent.role,
        targetSurface: template.targetSurface,
        title: `${targetAgentName}에게 ${template.title}`,
        toolLabel: toolProfile.label,
        toolPreview: toolProfile.visibleBadges,
      },
    ];
  }).slice(0, 5);
}

export function createMakimaDelegationWorkItems({
  card,
  createdAt,
  orchestratorAgentId,
  request,
  sessionId,
}: {
  card: MakimaDelegationCard;
  createdAt: string;
  orchestratorAgentId?: string;
  request: string;
  sessionId: string;
}): { handoff: WorkItemHandoff; workItem: WorkItem } {
  const workItemId = `work_item_makima_${crypto.randomUUID()}`;
  const evidenceId = `evidence_makima_${crypto.randomUUID()}`;
  const normalizedRequest = normalizeDelegationRequest(request);
  const workItem: WorkItem = {
    id: workItemId,
    createdAt,
    evidenceRefs: [
      {
        id: evidenceId,
        kind: "message",
        observedAt: createdAt,
        reference: `conversation://${sessionId}/makima-delegation`,
        summary: `마키마 지휘안: ${card.targetAgentName} · ${normalizedRequest}`,
      },
    ],
    kind: "internal_coord",
    lane: "auto",
    missingInfo: [],
    ownerAgentId: card.targetAgentId,
    priority: card.priority,
    sessionId,
    sourceRefs: [
      {
        externalId: orchestratorAgentId,
        observedAt: createdAt,
        source: "desktop_manual",
        title: "Makima Delegation Console",
      },
    ],
    status: "planned",
    summary: card.summary,
    surface: "conversation",
    title: card.title,
    updatedAt: createdAt,
  };
  const handoff: WorkItemHandoff = {
    id: `handoff_makima_${crypto.randomUUID()}`,
    approvalState: "required",
    createdAt,
    evidenceRefs: workItem.evidenceRefs,
    missingInfo: [],
    payloadRef: `work_item://${workItemId}`,
    summary: `${card.targetAgentName}에게 ${card.targetRoleLabel} 작업을 배정합니다. 대상: ${card.targetSurface}`,
    targetSurface: card.targetSurface,
    workItemId,
  };

  return { handoff, workItem };
}

function normalizeDelegationRequest(request: string) {
  const trimmed = request.trim().replace(/\s+/g, " ");
  return trimmed.length > 0 ? trimmed.slice(0, 180) : "현재 대화 흐름을 이어서 완성";
}
