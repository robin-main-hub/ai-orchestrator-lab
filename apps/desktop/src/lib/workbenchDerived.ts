import type {
  CodingPacket,
  InsightFinding,
  PermissionMatrixSnapshot,
  ProviderProfile,
  ProviderRuntimeReadiness,
  RuntimeSnapshot,
  WorkItem,
} from "@ai-orchestrator/protocol";
import type { Stage6MemoryInspector } from "../runtime/stage6Memory";
import type { MetaOnboardingSignal, ModelCatalog, WorkbenchAgent } from "../types";
export function statusForWorkLane(lane: WorkItem["lane"]): WorkItem["status"] {
  const statuses: Partial<Record<WorkItem["lane"], WorkItem["status"]>> = {
    auto: "running",
    check: "drafted",
    ask: "waiting_input",
    approve: "waiting_approval",
    blocked: "blocked",
    inbox: "inbox",
  };

  return statuses[lane] ?? "triaged";
}

export function createInsightFindings({
  eventCount,
  memoryInspector,
  packet,
  permissionSnapshot,
  providerReadiness,
}: {
  eventCount: number;
  memoryInspector: Stage6MemoryInspector;
  packet: CodingPacket;
  permissionSnapshot: PermissionMatrixSnapshot;
  providerReadiness: ProviderRuntimeReadiness;
}): InsightFinding[] {
  return [
    {
      id: "insight_stability",
      category: "stability",
      status: eventCount > 0 ? "ok" : "watch",
      label: `${eventCount} events`,
      summary: "Event Storage에 세션 흐름이 남는지 확인한다.",
    },
    {
      id: "insight_testing",
      category: "testing",
      status: packet.verificationPlan.length > 1 ? "ok" : "quick_win",
      label: `${packet.verificationPlan.length} checks`,
      summary: "검증 계획이 부족하면 Quick Wins로 typecheck/test를 먼저 주입한다.",
    },
    {
      id: "insight_architecture",
      category: "architecture",
      status: packet.context.some((item) => item.toLowerCase().includes("protocol")) ? "ok" : "watch",
      label: "protocol boundary",
      summary: "공통 타입과 이벤트 경계가 패킷에 들어갔는지 본다.",
    },
    {
      id: "insight_performance",
      category: "performance",
      status: memoryInspector.trace.results.length > 5 ? "watch" : "ok",
      label: `${memoryInspector.trace.results.length} recalls`,
      summary: "중복 recall이 많아지면 ContextPack tier를 낮춘다.",
    },
    {
      id: "insight_security",
      category: "security",
      status: permissionSnapshot.summary.pending > 0 || providerReadiness.status === "blocked" ? "watch" : "ok",
      label: `${permissionSnapshot.summary.pending} pending`,
      summary: "승인 대기, secret, provider trust를 배포 전에 확인한다.",
    },
    {
      id: "insight_tech_debt",
      category: "tech_debt",
      status: packet.rejectedOptions.length > 0 ? "ok" : "quick_win",
      label: `${packet.rejectedOptions.length} rejected`,
      summary: "버린 선택지를 남기면 이후 재논의를 줄일 수 있다.",
    },
  ];
}

export function createMetaOnboardingSignals({
  agents,
  models,
  providers,
  runtime,
}: {
  agents: WorkbenchAgent[];
  models: ModelCatalog;
  providers: ProviderProfile[];
  runtime: RuntimeSnapshot;
}): MetaOnboardingSignal[] {
  const roles = new Set(agents.map((agent) => agent.role));
  const modelCount = Object.values(models).reduce((total, providerModels) => total + providerModels.length, 0);
  return [
    {
      id: "meta_roles",
      label: "역할 구성",
      status: roles.has("verifier") && roles.has("memory_curator") ? "ready" : "partial",
      suggestion: roles.has("verifier") ? "검증 역할 있음" : "Verifier 추가 추천",
    },
    {
      id: "meta_engines",
      label: "엔진 감지",
      status: providers.length >= 3 && modelCount > 4 ? "ready" : "partial",
      suggestion: `${providers.length} providers / ${modelCount} models`,
    },
    {
      id: "meta_runtime",
      label: "실행 환경",
      status: runtime.dgxStatus === "online" || runtime.localModelStatus === "online" ? "ready" : "blocked",
      suggestion: runtime.dgxStatus === "online" ? "DGX-02 사용 가능" : "로컬 폴백 중심",
    },
  ];
}
