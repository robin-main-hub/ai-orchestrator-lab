import { compactPublicText } from "./publicRedaction";
import type {
  ApprovalQueueItem,
  ApprovalReplayKind,
  PermissionAction,
  SourceTrust,
} from "@ai-orchestrator/protocol";

export type ControlQueueLaneId = "approve" | "ask" | "edit" | "delegate" | "block" | "archive";
export type ControlQueueMetaVariant = "primary" | "success" | "warning" | "danger" | "muted";

export type ControlQueueMetaItem = {
  label: string;
  value: string;
  variant: ControlQueueMetaVariant;
};

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
  ask: "대화 입력창에 질문 초안 생성",
  block: "항목이 차단됩니다",
  delegate: "작업 항목에 실행 위임 초안 생성",
  edit: "작업 항목에 수정 초안 생성",
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

const actionLabels: Partial<Record<PermissionAction, string>> = {
  calendar_create: "일정 생성",
  contract_review: "계약 검토",
  conversation_reply: "대화 응답",
  customer_reply: "고객 답변",
  deploy: "배포",
  device_reboot: "장비 재시작",
  document_share: "문서 공유",
  email_send: "이메일 발송",
  external_message_send: "외부 메시지",
  file_write: "파일 수정",
  git_push: "Git Push",
  invoice_create: "청구 생성",
  mobile_approval: "모바일 승인",
  payment_action: "결제 처리",
  provider_completion: "모델 호출",
  quote_send: "견적 발송",
  remote_workspace: "원격 작업공간",
  secret_view: "비밀값 조회",
  terminal_run: "터미널 실행",
  unknown_external_effect: "알 수 없는 외부 효과",
};

const sourceTrustLabels: Record<SourceTrust, string> = {
  limited: "제한됨",
  trusted: "신뢰됨",
  untrusted: "비신뢰",
};

const replayLabels: Record<ApprovalReplayKind, string> = {
  agent_delegation: "위임 재실행",
  provider_completion: "모델 재실행",
  remote_run: "원격 재실행",
  tmux_dispatch: "tmux 재전송",
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

export function controlQueueActionLabel(action?: PermissionAction) {
  if (!action) return "실행 미정";
  return actionLabels[action] ?? action.replaceAll("_", " ");
}

export function controlQueueSourceTrustLabel(sourceTrust?: SourceTrust) {
  return sourceTrust ? sourceTrustLabels[sourceTrust] : "신뢰 미정";
}

export function controlQueueSourceTrustVariant(sourceTrust?: SourceTrust): ControlQueueMetaVariant {
  if (sourceTrust === "trusted") return "success";
  if (sourceTrust === "limited") return "warning";
  if (sourceTrust === "untrusted") return "danger";
  return "muted";
}

export function controlQueueReplayLabel(item: Pick<ApprovalQueueItem, "replayKind" | "replayEndpoint">) {
  if (!item.replayKind || !item.replayEndpoint) return "수동 처리";
  return replayLabels[item.replayKind] ?? item.replayKind.replaceAll("_", " ");
}

export function formatControlQueueTokenEstimate(costEstimateTokens?: number) {
  if (typeof costEstimateTokens !== "number") return "토큰 미정";
  if (costEstimateTokens >= 1_000) return `${Math.round(costEstimateTokens / 1_000)}k tok`;
  return `${costEstimateTokens} tok`;
}

export function controlQueueMetaItems(item: ApprovalQueueItem): ControlQueueMetaItem[] {
  const items: ControlQueueMetaItem[] = [
    {
      label: "실행",
      value: controlQueueActionLabel(item.action),
      variant: item.action ? "primary" : "muted",
    },
    {
      label: "신뢰",
      value: controlQueueSourceTrustLabel(item.sourceTrust),
      variant: controlQueueSourceTrustVariant(item.sourceTrust),
    },
    {
      label: "재실행",
      value: controlQueueReplayLabel(item),
      variant: item.replayKind && item.replayEndpoint ? "primary" : "muted",
    },
    {
      label: "예상",
      value: formatControlQueueTokenEstimate(item.costEstimateTokens),
      variant: "muted",
    },
  ];

  if (item.reason) {
    items.push({
      label: "사유",
      value: sanitizeControlQueueText(item.reason),
      variant: "muted",
    });
  }

  return items;
}

export function sanitizeControlQueueText(value: string) {
  const prepared = value.replace(/\braw prompt\s*:/gi, "원문 프롬프트:");
  return compactPublicText(prepared, 240)
    .replaceAll("[redacted:internal]", "도구 입력 [queue-redacted]")
    .replaceAll("[redacted:url]", "[url]")
    .replaceAll("Bearer [redacted]", "Bearer [token]")
    .replaceAll("[redacted:path]", "[local-path]")
    .replaceAll("[redacted]", "[비밀값]")
    .replace(/sent to \[local-path\] with \[비밀값\]/gi, "로컬 경로 전송 · 비밀값 마스킹됨")
    .replace(
      /tmux remote command needs approval before using Bearer \[token\]/gi,
      "터미널 원격 명령은 토큰 사용 전 승인이 필요합니다",
    )
    .replaceAll("[queue-redacted]", "[redacted]");
}
