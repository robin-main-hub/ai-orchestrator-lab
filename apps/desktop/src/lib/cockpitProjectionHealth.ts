export type CockpitLocalHealthInput = {
  dgxStatus: string;
  eventSyncLastError?: string;
  eventSyncStatus: string;
  memorySyncStatus: string;
};

export type CockpitServerSnapshotIndicatorInput = {
  error?: string;
  providerIndicator?: string;
  status: "idle" | "loading" | "loaded" | "failed";
  timestamp?: string;
};

export function createCockpitLocalHealthIndicators({
  dgxStatus,
  eventSyncLastError,
  eventSyncStatus,
  memorySyncStatus,
}: CockpitLocalHealthInput): string[] {
  const healthIndicators: string[] = [];
  if (dgxStatus === "offline") {
    healthIndicators.push("DGX-02 mirror node is offline");
  }
  if (memorySyncStatus === "degraded") {
    healthIndicators.push("Memory sync degraded");
  }
  if (eventSyncStatus === "failed") {
    healthIndicators.push(`Event outbox sync failure: ${eventSyncLastError || "unknown error"}`);
  }
  if (healthIndicators.length === 0) {
    healthIndicators.push("로컬 경고 없음 · 서버 스냅샷은 별도 확인");
  }
  return healthIndicators;
}

export function createCockpitServerSnapshotIndicator({
  error,
  providerIndicator,
  status,
  timestamp,
}: CockpitServerSnapshotIndicatorInput): string {
  if (status === "loading") {
    return "서버 스냅샷 동기화 중";
  }
  if (status === "loaded") {
    return providerIndicator
      ? `서버 스냅샷 동기화됨: ${providerIndicator}`
      : `서버 스냅샷 동기화됨: ${timestamp ?? "timestamp unavailable"}`;
  }
  if (status === "failed") {
    return `서버 스냅샷 실패 · 로컬 투영 유지: ${(error ?? "unknown error").slice(0, 120)}`;
  }
  return "서버 스냅샷 미연결 · 로컬 투영 표시 중";
}
