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

export type CockpitPayloadBindingInput = {
  expiresAt?: string;
  hasReplayMetadata: boolean;
  sourceTrust?: string;
};

export function createCockpitLocalHealthIndicators({
  dgxStatus,
  eventSyncLastError,
  eventSyncStatus,
  memorySyncStatus,
}: CockpitLocalHealthInput): string[] {
  const healthIndicators: string[] = [];
  if (dgxStatus === "offline") {
    healthIndicators.push("DGX-02 미러 노드 오프라인");
  }
  if (memorySyncStatus === "degraded") {
    healthIndicators.push("기억 동기화 저하");
  }
  if (eventSyncStatus === "failed") {
    healthIndicators.push(`이벤트 발신함 동기화 실패: ${sanitizeCockpitProjectionText(eventSyncLastError || "unknown error")}`);
  }
  if (healthIndicators.length === 0) {
    healthIndicators.push("로컬 경고 없음 · 서버 스냅샷은 별도 확인");
  }
  return healthIndicators;
}

export function sanitizeCockpitProjectionText(value: string) {
  return value
    .replace(/\braw prompt\s*:/gi, "원문 프롬프트:")
    .replace(/\btool input\b[\s\S]*/gi, "도구 입력 [redacted]")
    .replace(/https?:\/\/[^\s)]+/gi, "[url]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [token]")
    .replace(/\b(?:sk|tp)-[A-Za-z0-9_-]{6,}\b/g, "[secret]")
    .replace(/\b[A-Z][A-Z0-9_]*(?:API|TOKEN|SECRET|KEY)[A-Z0-9_]*=[^\s]+/g, "[env-secret]")
    .replace(/\/Users\/[^\s),;]+/g, "[local-path]")
    .slice(0, 240);
}

export function resolveCockpitPayloadBindingStatus({
  expiresAt,
  hasReplayMetadata,
  sourceTrust,
}: CockpitPayloadBindingInput): "bound" | "unbound" | "expired" {
  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
    return "expired";
  }
  if (hasReplayMetadata && sourceTrust === "trusted") {
    return "bound";
  }
  return "unbound";
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
      ? `서버 스냅샷 동기화됨: ${sanitizeCockpitProjectionText(providerIndicator)}`
      : `서버 스냅샷 동기화됨: ${timestamp ?? "timestamp unavailable"}`;
  }
  if (status === "failed") {
    return `서버 스냅샷 실패 · 로컬 투영 유지: ${sanitizeCockpitProjectionText(error ?? "unknown error")}`;
  }
  return "서버 스냅샷 미연결 · 로컬 투영 표시 중";
}
