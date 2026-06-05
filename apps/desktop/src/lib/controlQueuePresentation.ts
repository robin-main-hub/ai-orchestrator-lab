import { compactPublicText } from "./publicRedaction";

export type ControlQueueLaneId = "approve" | "ask" | "edit" | "delegate" | "block" | "archive";

const laneLabels: Record<ControlQueueLaneId, string> = {
  approve: "승인",
  archive: "거부",
  ask: "질문 요청",
  block: "차단",
  delegate: "실행 위임",
  edit: "수정 초안",
};

const actionFeedbackLabels: Record<ControlQueueLaneId, string> = {
  approve: "승인 처리",
  archive: "거부 처리",
  ask: "질문이 대화 초안으로 준비됩니다",
  block: "항목이 차단됩니다",
  delegate: "실행 위임안이 준비됩니다",
  edit: "수정 초안이 생성됩니다",
};

const stateLabels: Record<string, string> = {
  approved: "승인됨",
  expired: "만료됨",
  rejected: "거부됨",
  required: "승인 필요",
};

const permissionLabels: Record<string, string> = {
  external_ingress: "외부 인입",
  local_filesystem: "로컬 파일 접근",
  provider_credentials: "프로바이더 인증",
  remote_workspace: "원격 작업공간",
  run_dangerous_commands: "위험 명령 실행",
};

export function controlQueueLaneLabel(lane: ControlQueueLaneId) {
  return laneLabels[lane];
}

export function controlQueueActionFeedback(lane: ControlQueueLaneId) {
  return actionFeedbackLabels[lane];
}

export function controlQueueStateLabel(state: string) {
  return stateLabels[state] ?? state.replaceAll("_", " ");
}

export function controlQueuePermissionLabel(permission: string) {
  return permissionLabels[permission] ?? permission.replaceAll("_", " ");
}

export function sanitizeControlQueueText(value: string) {
  const prepared = value.replace(/\braw prompt\s*:/gi, "원문 프롬프트:");
  return compactPublicText(prepared, 240)
    .replaceAll("[redacted:internal]", "도구 입력 [queue-redacted]")
    .replaceAll("[redacted:url]", "[url]")
    .replaceAll("Bearer [redacted]", "Bearer [token]")
    .replaceAll("[redacted:path]", "[local-path]")
    .replaceAll("[redacted]", "[secret]")
    .replaceAll("[queue-redacted]", "[redacted]");
}
