export type BigRockId =
  | "02_control_queue"
  | "03_debate_to_packet"
  | "04_tmux_runtime"
  | "05_provider_console"
  | "06_memory_curator"
  | "07_receipts_search"
  | "08_attachments"
  | "09_onboarding"
  | "10_e2e_smoke";

export type BigRockMaturityStatus = "ready" | "needs_work" | "blocked";

export type BigRockCompletionTarget = {
  id: BigRockId;
  label: string;
  readyAction: string;
  requiredAction: string;
};

export const BIG_ROCK_COMPLETION_TARGETS: BigRockCompletionTarget[] = [
  {
    id: "02_control_queue",
    label: "작업 대기열 실사용 연결",
    readyAction: "작업 대기열 6개 흐름 연결 완료",
    requiredAction: "작업 대기열 6개 흐름을 모두 작업 항목/핸드오프/승인 결과로 연결",
  },
  {
    id: "03_debate_to_packet",
    label: "토론 결정 패킷화",
    readyAction: "토론 결정에서 코딩 패킷 후보 생성 가능",
    requiredAction: "토론 결정 노드에서 코딩 패킷 후보와 작업 항목을 생성",
  },
  {
    id: "04_tmux_runtime",
    label: "Tmux 실행/복구 런타임",
    readyAction: "Tmux 창 실행·캡처·복구 요약 가능",
    requiredAction: "Tmux 창 타임라인과 복구 계획을 연결",
  },
  {
    id: "05_provider_console",
    label: "공급자 운영 콘솔",
    readyAction: "공급자 라우팅·장애·대체 경로·상태 점검 표시 가능",
    requiredAction: "공급자 상태 점검/대체 경로/할당 현황을 운영 콘솔에 연결",
  },
  {
    id: "06_memory_curator",
    label: "기억 큐레이터 승격 루프",
    readyAction: "모든 에이전트 기억 설치와 큐레이터 후보 승격 가능",
    requiredAction: "모든 에이전트 기억 설치와 큐레이터 후보 승격 흐름을 연결",
  },
  {
    id: "07_receipts_search",
    label: "공개 브리핑/감사 검색",
    readyAction: "공개 브리핑 검색과 마스킹 점검 통과",
    requiredAction: "공개 브리핑 검색과 렌더 직전 마스킹을 통과",
  },
  {
    id: "08_attachments",
    label: "첨부파일 처리",
    readyAction: "문서·이미지·텍스트 첨부 처리 경계 준비",
    requiredAction: "첨부파일 분류와 처리 흐름을 연결",
  },
  {
    id: "09_onboarding",
    label: "첫 실행 온보딩/진단",
    readyAction: "첫 실행 필수 진단 통과",
    requiredAction: "첫 실행 공급자/기억/런타임 진단을 통과",
  },
  {
    id: "10_e2e_smoke",
    label: "종단/시각/공급자 점검",
    readyAction: "핵심 점검 계획 준비",
    requiredAction: "종단/시각/공급자 점검 축을 준비",
  },
];

export type OrchestrationMaturityInput = {
  attachments: {
    acceptedTypeCount: number;
    hasProcessingPipeline: boolean;
    pendingCount: number;
  };
  controlQueue: {
    connectedLaneCount: number;
    pendingApprovalCount: number;
    workItemProjectionCount: number;
  };
  debate: {
    codingImpactCount: number;
    decisionCount: number;
    hasCodingPacketProjection: boolean;
    readinessState: "ready" | "needs_review" | "blocked";
  };
  e2e: {
    desktopTestCount: number;
    hasProviderSmokeHarness: boolean;
    hasVisualSmokeChecklist: boolean;
  };
  memory: {
    agentInstallCount: number;
    curatorCandidateCount: number;
    installedAgentCount: number;
    promotedCount: number;
  };
  onboarding: {
    blockingCheckCount: number;
    passedCheckCount: number;
    totalCheckCount: number;
  };
  provider: {
    assignedAgentCount: number;
    fallbackReadyCount: number;
    profileCount: number;
    smokeReadyCount: number;
  };
  receipts: {
    receiptCount: number;
    searchableCount: number;
    unsafeReceiptCount: number;
  };
  tmux: {
    hasRecoveryPlan: boolean;
    paneCount: number;
    timelineBlockCount: number;
  };
};

export type BigRockMaturityItem = {
  detail: string;
  id: BigRockId;
  label: string;
  nextAction?: string;
  status: BigRockMaturityStatus;
};

export type OrchestrationMaturityReport = {
  blockedCount: number;
  items: BigRockMaturityItem[];
  nextActions: string[];
  overallStatus: BigRockMaturityStatus;
  readyCount: number;
};

export function createOrchestrationMaturityReport(input: OrchestrationMaturityInput): OrchestrationMaturityReport {
  const items = BIG_ROCK_COMPLETION_TARGETS.map((target): BigRockMaturityItem => {
    const status = statusFor(target.id, input);
    return {
      detail: detailFor(target.id, input),
      id: target.id,
      label: target.label,
      nextAction: status === "ready" ? undefined : nextActionFor(target.id, target.requiredAction, input),
      status,
    };
  });
  const readyCount = items.filter((item) => item.status === "ready").length;
  const blockedCount = items.filter((item) => item.status === "blocked").length;
  const nextActions = items.flatMap((item) => (item.nextAction ? [item.nextAction] : []));

  return {
    blockedCount,
    items,
    nextActions,
    overallStatus: blockedCount > 0 ? "blocked" : readyCount === items.length ? "ready" : "needs_work",
    readyCount,
  };
}

function statusFor(id: BigRockId, input: OrchestrationMaturityInput): BigRockMaturityStatus {
  switch (id) {
    case "02_control_queue":
      return input.controlQueue.connectedLaneCount >= 6 && input.controlQueue.workItemProjectionCount >= 4
        ? "ready"
        : "needs_work";
    case "03_debate_to_packet":
      if (input.debate.readinessState === "blocked") return "blocked";
      return input.debate.readinessState === "ready" &&
        input.debate.decisionCount > 0 &&
        input.debate.codingImpactCount > 0 &&
        input.debate.hasCodingPacketProjection
        ? "ready"
        : "needs_work";
    case "04_tmux_runtime":
      return input.tmux.paneCount > 0 && input.tmux.timelineBlockCount > 0 && input.tmux.hasRecoveryPlan
        ? "ready"
        : "needs_work";
    case "05_provider_console":
      return input.provider.profileCount > 0 &&
        input.provider.assignedAgentCount > 0 &&
        input.provider.smokeReadyCount > 0 &&
        input.provider.fallbackReadyCount > 0
        ? "ready"
        : "needs_work";
    case "06_memory_curator":
      return input.memory.agentInstallCount > 0 &&
        input.memory.installedAgentCount >= input.memory.agentInstallCount &&
        input.memory.curatorCandidateCount > 0 &&
        input.memory.promotedCount > 0
        ? "ready"
        : "needs_work";
    case "07_receipts_search":
      return input.receipts.receiptCount > 0 &&
        input.receipts.searchableCount >= input.receipts.receiptCount &&
        input.receipts.unsafeReceiptCount === 0
        ? "ready"
        : "needs_work";
    case "08_attachments":
      return input.attachments.acceptedTypeCount >= 3 &&
        input.attachments.hasProcessingPipeline &&
        input.attachments.pendingCount === 0
        ? "ready"
        : "needs_work";
    case "09_onboarding":
      return input.onboarding.totalCheckCount > 0 &&
        input.onboarding.passedCheckCount >= input.onboarding.totalCheckCount &&
        input.onboarding.blockingCheckCount === 0
        ? "ready"
        : "blocked";
    case "10_e2e_smoke":
      return input.e2e.desktopTestCount > 0 && input.e2e.hasProviderSmokeHarness && input.e2e.hasVisualSmokeChecklist
        ? "ready"
        : "needs_work";
    default:
      return "needs_work";
  }
}

function detailFor(id: BigRockId, input: OrchestrationMaturityInput): string {
  switch (id) {
    case "02_control_queue":
      return `${input.controlQueue.connectedLaneCount}/6 흐름 · 작업 항목 ${input.controlQueue.workItemProjectionCount}개 · 승인 ${input.controlQueue.pendingApprovalCount}건`;
    case "03_debate_to_packet":
      return `결정 ${input.debate.decisionCount}개 · 코딩 영향 ${input.debate.codingImpactCount}개 · 상태 ${debateReadinessStateLabel(input.debate.readinessState)}`;
    case "04_tmux_runtime":
      return `창 ${input.tmux.paneCount}개 · 타임라인 ${input.tmux.timelineBlockCount}개 · 복구 ${input.tmux.hasRecoveryPlan ? "있음" : "없음"}`;
    case "05_provider_console":
      return `공급자 ${input.provider.profileCount}개 · 점검 ${input.provider.smokeReadyCount}개 · 대체 경로 ${input.provider.fallbackReadyCount}개`;
    case "06_memory_curator":
      return `설치 ${input.memory.installedAgentCount}/${input.memory.agentInstallCount} · 후보 ${input.memory.curatorCandidateCount}개 · 승격 ${input.memory.promotedCount}개`;
    case "07_receipts_search":
      return `브리핑 ${input.receipts.receiptCount}개 · 검색 ${input.receipts.searchableCount}개 · 위험 ${input.receipts.unsafeReceiptCount}개`;
    case "08_attachments":
      return `허용 타입 ${input.attachments.acceptedTypeCount}개 · 대기 ${input.attachments.pendingCount}개`;
    case "09_onboarding":
      return `진단 ${input.onboarding.passedCheckCount}/${input.onboarding.totalCheckCount} · 차단 ${input.onboarding.blockingCheckCount}개`;
    case "10_e2e_smoke":
      return `데스크톱 테스트 ${input.e2e.desktopTestCount}개 · 공급자 점검 ${input.e2e.hasProviderSmokeHarness ? "있음" : "없음"} · 시각 점검 ${input.e2e.hasVisualSmokeChecklist ? "있음" : "없음"}`;
    default:
      return "";
  }
}

function debateReadinessStateLabel(state: OrchestrationMaturityInput["debate"]["readinessState"]): string {
  const labels: Record<OrchestrationMaturityInput["debate"]["readinessState"], string> = {
    blocked: "차단",
    needs_review: "검토 필요",
    ready: "준비됨",
  };
  return labels[state];
}

function nextActionFor(
  id: BigRockId,
  fallbackAction: string,
  input: OrchestrationMaturityInput,
): string {
  if (id === "07_receipts_search" && input.receipts.unsafeReceiptCount > 0) {
    return `공개 브리핑 마스킹 실패 ${input.receipts.unsafeReceiptCount}건 해결`;
  }
  if (id === "08_attachments" && input.attachments.pendingCount > 0) {
    return `첨부 ${input.attachments.pendingCount}개 처리 계획을 확인하고 대화에 전송`;
  }
  return fallbackAction;
}
