export type SettingsDiagnosticStatus = "pass" | "warn" | "block";

export type SettingsDiagnosticItem = {
  id: "providers" | "provider_smoke" | "memory" | "workers" | "runtime";
  label: string;
  nextAction?: string;
  status: SettingsDiagnosticStatus;
};

export type SettingsDiagnostics = {
  blockingCount: number;
  items: SettingsDiagnosticItem[];
  nextActions: string[];
  status: "ready" | "needs_attention" | "blocked";
};

export function createSettingsDiagnostics({
  agentCount,
  enabledProviderCount,
  memoryAdapterStatus,
  providerSmokeReadyCount,
  runtimeStatus,
  workerCount,
}: {
  agentCount: number;
  enabledProviderCount: number;
  memoryAdapterStatus: "loading" | "ready" | "error";
  providerSmokeReadyCount: number;
  runtimeStatus: "online" | "degraded" | "offline";
  workerCount: number;
}): SettingsDiagnostics {
  const items: SettingsDiagnosticItem[] = [
    enabledProviderCount > 0
      ? { id: "providers", label: `활성 Provider ${enabledProviderCount}개`, status: "pass" }
      : { id: "providers", label: "활성 Provider 없음", nextAction: "활성 Provider를 1개 이상 설정", status: "block" },
    providerSmokeReadyCount > 0
      ? { id: "provider_smoke", label: `Provider smoke ${providerSmokeReadyCount}개 준비`, status: "pass" }
      : { id: "provider_smoke", label: "Provider smoke 준비 부족", nextAction: "Provider smoke harness 확인", status: "warn" },
    memoryAdapterStatus === "ready"
      ? { id: "memory", label: "Memory adapter 정상", status: "pass" }
      : {
          id: "memory",
          label: memoryAdapterStatus === "loading" ? "Memory adapter 로딩 중" : "Memory adapter 오류",
          nextAction: "Memory adapter 상태 복구",
          status: memoryAdapterStatus === "loading" ? "warn" : "block",
        },
    workerCount >= Math.max(1, agentCount)
      ? { id: "workers", label: `워커 ${workerCount}/${agentCount} 준비`, status: "pass" }
      : { id: "workers", label: `워커 ${workerCount}/${agentCount} 부족`, nextAction: "에이전트 워커 준비 상태 확인", status: "block" },
    runtimeStatus === "online"
      ? { id: "runtime", label: "Runtime online", status: "pass" }
      : {
          id: "runtime",
          label: `Runtime ${runtimeStatus}`,
          nextAction: "Runtime 서버 연결 확인",
          status: runtimeStatus === "degraded" ? "warn" : "block",
        },
  ];
  const blockingCount = items.filter((item) => item.status === "block").length;
  const warningCount = items.filter((item) => item.status === "warn").length;

  return {
    blockingCount,
    items,
    nextActions: items.flatMap((item) => (item.nextAction ? [item.nextAction] : [])),
    status: blockingCount > 0 ? "blocked" : warningCount > 0 ? "needs_attention" : "ready",
  };
}
