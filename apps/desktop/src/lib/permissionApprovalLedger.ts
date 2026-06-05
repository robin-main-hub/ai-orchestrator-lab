import type {
  ApprovalState,
  EventEnvelope,
  OperatorCockpitDispatchHistory,
  PermissionAction,
  PermissionMatrixItem,
  PermissionMatrixSnapshot,
} from "@ai-orchestrator/protocol";
import type { TmuxRedispatchOutcome } from "../components/OperationsRailPanel";
import { sanitizeControlQueueText } from "./controlQueuePresentation";

export type PermissionApprovalLedgerInput = {
  decisionEvents?: EventEnvelope[];
  limit?: number;
  permissionSnapshot: PermissionMatrixSnapshot;
  tmuxRedispatchOutcomes?: TmuxRedispatchOutcome[];
};

export function createPermissionApprovalLedger({
  decisionEvents = [],
  limit = 12,
  permissionSnapshot,
  tmuxRedispatchOutcomes = [],
}: PermissionApprovalLedgerInput): OperatorCockpitDispatchHistory[] {
  const decisionsBySourceItemId = new Map(decisionEvents.map(readDecisionEvent).filter(isLedgerDecisionEntry));
  const permissionRecords = permissionSnapshot.items.map((item) =>
    createPermissionRecord(item, decisionsBySourceItemId.get(item.id)),
  );
  const outcomeRecords = tmuxRedispatchOutcomes.map((outcome) =>
    createTmuxOutcomeRecord(outcome, permissionSnapshot.items.find((item) => item.id === outcome.sourceItemId)),
  );

  return [...outcomeRecords, ...permissionRecords]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

type LedgerDecisionEvent = {
  decidedAt: string;
  decidedBy: string;
  sourceItemId: string;
  state: ApprovalState;
};

function createPermissionRecord(
  item: PermissionMatrixItem,
  decisionEvent?: LedgerDecisionEvent,
): OperatorCockpitDispatchHistory {
  const tamperWarning = item.sourceTrust === "untrusted";
  const approvalState = decisionEvent?.state ?? item.state;
  const createdAt = decisionEvent?.decidedAt ?? item.createdAt;
  return {
    dispatchId: item.id,
    requesterAgentId: decisionEvent?.decidedBy ?? item.actor,
    approvalState,
    actionSummary: permissionActionLabel(item.action),
    decisionReason: sanitizeControlQueueText(item.reason),
    ledgerDigest: createLedgerDigest(`${item.sessionId}:${item.id}:${approvalState}:${createdAt}`),
    policyCode: policyCodeForPermission(item, approvalState),
    replayPayloadDigest: createDeterministicDigest(`${item.id}:${item.subjectId}:${item.action}:${approvalState}`),
    tamperWarning,
    tamperReason: tamperWarning ? `비신뢰 출처: ${sanitizeControlQueueText(item.channel)}` : undefined,
    sourceTrust: item.sourceTrust,
    evidenceRefs: [
      {
        id: `ledger_evidence_${item.id}`,
        kind: "event",
        reference: `permission://${item.id}`,
        summary: `${permissionActionLabel(item.action)} · ${approvalStateLabel(approvalState)}`,
        observedAt: createdAt,
      },
    ],
    createdAt,
  };
}

function createTmuxOutcomeRecord(
  outcome: TmuxRedispatchOutcome,
  sourceItem?: PermissionMatrixItem,
): OperatorCockpitDispatchHistory {
  const approvalState = approvalStateFromTmuxStatus(outcome.status);
  const tamperWarning = sourceItem?.sourceTrust === "untrusted" || outcome.status === "blocked";
  return {
    dispatchId: outcome.approvalId,
    requesterAgentId: outcome.role,
    approvalState,
    actionSummary: "tmux 전송",
    decisionReason: sanitizeControlQueueText(outcome.reason || "tmux 전송 결과가 기록되었습니다."),
    ledgerDigest: createLedgerDigest(`${outcome.approvalId}:${approvalState}:${outcome.createdAt}`),
    policyCode: policyCodeForApprovalState(approvalState),
    replayPayloadDigest: outcome.sourceItemId
      ? createDeterministicDigest(`${outcome.approvalId}:${outcome.sourceItemId}`)
      : "unavailable",
    tamperWarning,
    tamperReason:
      sourceItem?.sourceTrust === "untrusted"
        ? `비신뢰 전송 출처: ${sanitizeControlQueueText(sourceItem.channel)}`
        : outcome.status === "blocked"
          ? sanitizeControlQueueText(outcome.reason || "차단됨")
          : undefined,
    sourceTrust: sourceItem?.sourceTrust,
    evidenceRefs: outcome.sourceItemId
      ? [
          {
            id: `ledger_evidence_${outcome.sourceItemId}`,
            kind: "routine_reference",
            reference: `permission://${outcome.sourceItemId}`,
            summary: `승인 출처: ${sanitizeControlQueueText(outcome.sourceItemId)}`,
            observedAt: outcome.createdAt,
          },
        ]
      : [],
    createdAt: outcome.createdAt,
  };
}

function approvalStateFromTmuxStatus(status: TmuxRedispatchOutcome["status"]): ApprovalState {
  if (status === "sent" || status === "recorded") {
    return "approved";
  }
  if (status === "pending_approval") {
    return "required";
  }
  if (status === "dry_run") {
    return "not_required";
  }
  return "rejected";
}

function approvalStateLabel(state: ApprovalState) {
  const labels: Record<ApprovalState, string> = {
    approved: "승인됨",
    expired: "만료됨",
    not_required: "승인 불필요",
    rejected: "거부됨",
    required: "승인 필요",
  };
  return labels[state];
}

function permissionActionLabel(action: PermissionAction) {
  const labels: Record<PermissionAction, string> = {
    backup_export: "백업 내보내기",
    calendar_create: "일정 생성",
    contract_review: "계약 검토",
    conversation_reply: "대화 응답",
    customer_reply: "고객 답변",
    deploy: "배포",
    device_reboot: "장치 재부팅",
    document_share: "문서 공유",
    email_send: "이메일 발송",
    external_message_send: "외부 메시지 발송",
    file_write: "파일 쓰기",
    git_push: "Git 푸시",
    invoice_create: "청구서 생성",
    memory_write: "기억 저장",
    mobile_approval: "모바일 승인",
    payment_action: "결제 작업",
    provider_completion: "모델 호출",
    quote_send: "견적 발송",
    remote_workspace: "원격 작업공간",
    secret_view: "비밀값 조회",
    terminal_run: "터미널 실행",
    unknown_external_effect: "알 수 없는 외부 효과",
  };
  return labels[action];
}

function policyCodeForPermission(item: PermissionMatrixItem, state: ApprovalState) {
  if (item.sourceTrust === "untrusted") {
    return "TRUST-UNTRUSTED";
  }
  if (item.action === "unknown_external_effect") {
    return "POLICY-UNKNOWN";
  }
  return policyCodeForApprovalState(state);
}

function policyCodeForApprovalState(state: ApprovalState) {
  const labels: Record<ApprovalState, string> = {
    approved: "OPERATOR-APPROVED",
    expired: "TTL-EXPIRED",
    not_required: "POLICY-ALLOW",
    rejected: "OPERATOR-REJECTED",
    required: "APPROVAL-REQUIRED",
  };
  return labels[state];
}

function readDecisionEvent(event: EventEnvelope): [string, LedgerDecisionEvent] | undefined {
  if (event.type !== "permission.queue.updated" || !event.payload || typeof event.payload !== "object") {
    return undefined;
  }
  const payload = event.payload as Partial<LedgerDecisionEvent>;
  if (
    typeof payload.sourceItemId !== "string" ||
    typeof payload.decidedAt !== "string" ||
    !isApprovalState(payload.state)
  ) {
    return undefined;
  }
  return [
    payload.sourceItemId,
    {
      decidedAt: payload.decidedAt,
      decidedBy: typeof payload.decidedBy === "string" ? sanitizeControlQueueText(payload.decidedBy) : "desktop_operator",
      sourceItemId: payload.sourceItemId,
      state: payload.state,
    },
  ];
}

function isLedgerDecisionEntry(value: [string, LedgerDecisionEvent] | undefined): value is [string, LedgerDecisionEvent] {
  return Boolean(value);
}

function isApprovalState(value: unknown): value is ApprovalState {
  return value === "not_required" || value === "required" || value === "approved" || value === "rejected" || value === "expired";
}

function createDeterministicDigest(value: string) {
  let hash = 0x811c9dc5;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `sha256:${hash.toString(16).padStart(8, "0")}`;
}

function createLedgerDigest(value: string) {
  return `ledger:${createDeterministicDigest(value).replace("sha256:", "")}`;
}
