import type { ApprovalState, IngressConfidence, ProviderRuntimeReadiness, RuntimeSnapshot } from "@ai-orchestrator/protocol";

export type RailTmuxRedispatchOutcomeStatus =
  | "sent"
  | "failed"
  | "blocked"
  | "recorded"
  | "pending_approval"
  | "dry_run";

export function runtimeStatusLabel(status: RuntimeSnapshot["status"] | string): string {
  const labels: Record<string, string> = {
    degraded: "저하",
    failed: "실패",
    loading: "불러오는 중",
    offline: "오프라인",
    online: "온라인",
    ready: "준비됨",
  };
  return labels[status] ?? status;
}

export function runtimeNodeRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    authority: "권한",
    connected: "연결됨",
    guarded: "보호됨",
    heartbeat: "하트비트",
    "home pc": "홈 PC",
    "local models": "로컬 모델",
    main: "주 서버",
    memento: "기억",
    "needs DGX": "DGX 필요",
    "online-only": "온라인 전용",
    ready: "준비됨",
    watchdog: "감시",
  };
  return labels[role] ?? role;
}

export function backupStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    blocked: "차단",
    failed: "실패",
    pending: "대기 중",
    queued: "대기 중",
    ready: "준비됨",
    synced: "동기화됨",
  };
  return labels[status] ?? status;
}

export function providerReadinessLabel(status: ProviderRuntimeReadiness["status"] | string): string {
  const labels: Record<string, string> = {
    blocked: "차단",
    credential_required: "인증 필요",
    needs_approval: "승인 필요",
    ready: "준비됨",
  };
  return labels[status] ?? status;
}

export function ingressConfidenceLabel(confidence: IngressConfidence | string): string {
  const labels: Record<string, string> = {
    high: "높음",
    low: "낮음",
    medium: "중간",
  };
  return labels[confidence] ?? confidence;
}

export function ingressApprovalStateLabel(state: ApprovalState | string): string {
  const labels: Record<string, string> = {
    approved: "승인됨",
    expired: "만료됨",
    not_required: "승인 불필요",
    rejected: "거부됨",
    required: "승인 필요",
  };
  return labels[state] ?? state;
}

export function ingressChannelLabel(channel: string): string {
  const labels: Record<string, string> = {
    api: "API",
    external_legacy: "외부 레거시",
    mobile: "모바일",
    webhook: "웹훅",
  };
  return labels[channel] ?? channel;
}

export function ingressPermissionLabel(permission: string): string {
  const labels: Record<string, string> = {
    network_access: "네트워크 접근",
    read_only: "읽기 전용",
    remote_workspace: "원격 작업공간",
    run_dangerous_commands: "위험 명령 실행",
    run_safe_commands: "안전 명령 실행",
    secret_access: "비밀값 접근",
    write_files: "파일 수정",
  };
  return labels[permission] ?? permission;
}

export function approvalServerStatusLabel(status: "idle" | "loading" | "error" | "ready"): string {
  const labels: Record<typeof status, string> = {
    error: "오류",
    idle: "대기",
    loading: "불러오는 중",
    ready: "준비됨",
  };
  return labels[status];
}

export function tmuxRedispatchOutcomeLabel(status: RailTmuxRedispatchOutcomeStatus): string {
  const labels: Record<RailTmuxRedispatchOutcomeStatus, string> = {
    blocked: "차단",
    dry_run: "예행 실행",
    failed: "실패",
    pending_approval: "승인 대기",
    recorded: "기록됨",
    sent: "전송됨",
  };
  return labels[status];
}

export type RailStatusTone = "accent" | "warning" | "destructive" | "muted";

/**
 * U21 상태 톤 단일본: failed/blocked=destructive, watch/승인대기=warning,
 * 정상=accent, 유휴=fg-muted(muted). 미상은 정직하게 muted(초록 오표기 방지).
 * 라벨 텍스트와 별개로, 관리 묶음 상태점 data-tone 색을 산출하는 정본(MGT-2~6 소비).
 */
export function railStatusTone(status: string): RailStatusTone {
  const s = status.trim().toLowerCase();
  const destructive = new Set([
    "failed",
    "fail",
    "blocked",
    "error",
    "errored",
    "rejected",
    "expired",
    "offline",
    "dead",
    "down",
  ]);
  const warning = new Set([
    "watch",
    "pending_approval",
    "needs_approval",
    "required",
    "credential_required",
    "degraded",
    "warning",
    "review",
    "waiting",
  ]);
  const accent = new Set([
    "online",
    "ready",
    "synced",
    "approved",
    "connected",
    "sent",
    "done",
    "ok",
    "healthy",
    "live",
    "active",
    "passed",
    "deployed",
    "recorded",
  ]);
  if (destructive.has(s)) return "destructive";
  if (warning.has(s)) return "warning";
  if (accent.has(s)) return "accent";
  return "muted";
}
