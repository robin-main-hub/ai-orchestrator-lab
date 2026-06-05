import type {
  ApprovalQueueItem,
  AssistantDraft,
  EvidenceRef,
  WorkItem,
  WorkItemHandoff,
} from "@ai-orchestrator/protocol";
import { controlQueuePermissionLabel, sanitizeControlQueueText } from "./controlQueuePresentation";

type ControlQueueProjectionInput = {
  createdAt: string;
  sessionId: string;
};

function createPermissionEvidence(item: ApprovalQueueItem, createdAt: string): EvidenceRef {
  const summary = sanitizeControlQueueText(item.reason ?? item.summary);
  return {
    id: `evidence_permission_${item.sourceItemId}`,
    kind: "event",
    reference: `permission://${item.sourceItemId}`,
    title: item.action ? `권한 요청: ${sanitizeControlQueueText(item.action)}` : "권한 요청",
    summary,
    observedAt: createdAt,
  };
}

function createBaseWorkItem(
  item: ApprovalQueueItem,
  input: ControlQueueProjectionInput,
  patch: Pick<WorkItem, "lane" | "status" | "surface" | "title" | "summary"> &
    Partial<Pick<WorkItem, "missingInfo" | "priority">>,
): WorkItem {
  return {
    id: `work_item_permission_${patch.lane}_${crypto.randomUUID()}`,
    sessionId: input.sessionId,
    title: sanitizeControlQueueText(patch.title),
    kind: "internal_coord",
    lane: patch.lane,
    surface: patch.surface,
    status: patch.status,
    summary: sanitizeControlQueueText(patch.summary),
    sourceRefs: [
      {
        source: "desktop_manual",
        externalId: item.sourceItemId,
        observedAt: input.createdAt,
        title: "승인 대기열",
      },
    ],
    evidenceRefs: [createPermissionEvidence(item, input.createdAt)],
    missingInfo: patch.missingInfo ?? [],
    priority: patch.priority ?? (item.permissions.includes("run_dangerous_commands") ? "high" : "normal"),
    createdAt: input.createdAt,
  };
}

export function createControlQueueAskItem(
  item: ApprovalQueueItem,
  input: ControlQueueProjectionInput,
): WorkItem {
  return createBaseWorkItem(item, input, {
    lane: "ask",
    status: "waiting_input",
    surface: "conversation",
    title: `질문 필요: ${sanitizeControlQueueText(item.summary).slice(0, 56)}`,
    summary: sanitizeControlQueueText(item.reason ?? item.summary),
    missingInfo: [
      {
        id: `missing_permission_${item.sourceItemId}`,
        label: "운영자 보충 답변",
        reason: "승인 또는 거부 전에 추가 판단 근거가 필요합니다.",
        required: true,
        status: "missing",
      },
    ],
  });
}

export function createControlQueueEditDraft(
  item: ApprovalQueueItem,
  input: ControlQueueProjectionInput,
): { draft: AssistantDraft; workItem: WorkItem } {
  const workItem = createBaseWorkItem(item, input, {
    lane: "check",
    status: "drafted",
    surface: "conversation",
    title: `수정 초안: ${sanitizeControlQueueText(item.summary).slice(0, 56)}`,
    summary: sanitizeControlQueueText(item.reason ?? item.summary),
  });
  const draft: AssistantDraft = {
    id: `draft_permission_${crypto.randomUUID()}`,
    workItemId: workItem.id,
    sessionId: input.sessionId,
    title: `승인 대기열 수정 초안`,
    body: [
      sanitizeControlQueueText(item.summary),
      item.reason ? `사유: ${sanitizeControlQueueText(item.reason)}` : undefined,
      `권한: ${item.permissions.map(controlQueuePermissionLabel).join(", ")}`,
      "운영자가 승인 전에 문구와 실행 조건을 다시 다듬을 수 있도록 생성된 초안입니다.",
    ].filter(Boolean).join("\n"),
    targetSurface: "conversation",
    status: "draft",
    confidence: "medium",
    evidenceRefs: workItem.evidenceRefs,
    missingInfo: [],
    createdAt: input.createdAt,
  };

  return { draft, workItem };
}

export function createControlQueueDelegateHandoff(
  item: ApprovalQueueItem,
  input: ControlQueueProjectionInput,
): { handoff: WorkItemHandoff; workItem: WorkItem } {
  const workItem = createBaseWorkItem(item, input, {
    lane: "approve",
    status: "waiting_approval",
    surface: "execution_slot",
    title: `실행 위임: ${sanitizeControlQueueText(item.summary).slice(0, 56)}`,
    summary: sanitizeControlQueueText(item.reason ?? item.summary),
  });
  const handoff: WorkItemHandoff = {
    id: `handoff_permission_${crypto.randomUUID()}`,
    workItemId: workItem.id,
    targetSurface: "execution_slot",
    summary: `승인 대기열 항목을 실행 슬롯으로 위임: ${sanitizeControlQueueText(item.summary)}`,
    payloadRef: `permission://${item.sourceItemId}`,
    evidenceRefs: workItem.evidenceRefs,
    missingInfo: [],
    approvalState: "required",
    createdAt: input.createdAt,
  };

  return { handoff, workItem };
}

export function createControlQueueBlockItem(
  item: ApprovalQueueItem,
  input: ControlQueueProjectionInput,
): WorkItem {
  return createBaseWorkItem(item, input, {
    lane: "blocked",
    status: "blocked",
    surface: "execution_slot",
    title: `차단됨: ${sanitizeControlQueueText(item.summary).slice(0, 56)}`,
    summary: sanitizeControlQueueText(item.reason ?? item.summary),
    priority: "high",
  });
}
