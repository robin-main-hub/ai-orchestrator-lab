import type {
  ApprovalQueueItem,
  ApprovalState,
  ExternalApprovalItem,
  MobileActionPolicy,
  PermissionAction,
  PermissionActor,
  PermissionDecision,
  EventSource,
  PermissionLevel,
  PermissionMatrixItem,
  PermissionMatrixSnapshot,
  RuntimeSnapshot,
  TerminalSlot,
} from "@ai-orchestrator/protocol";
import type { Stage4AgentRun, Stage4RunStep } from "./stage4Runtime";

export type Stage9PermissionInput = {
  sessionId: string;
  externalApprovals: ExternalApprovalItem[];
  terminalSlots: TerminalSlot[];
  agentRun: Stage4AgentRun;
  runtime: RuntimeSnapshot;
  mobilePolicy: MobileActionPolicy;
  decisions?: Record<string, ApprovalState>;
  createdAt?: string;
};

export function createStage9PermissionSnapshot({
  sessionId,
  externalApprovals,
  terminalSlots,
  agentRun,
  runtime,
  mobilePolicy,
  decisions = {},
  createdAt = new Date().toISOString(),
}: Stage9PermissionInput): PermissionMatrixSnapshot {
  const items = [
    ...externalApprovals.map((approval) => createExternalApprovalItem(sessionId, approval, decisions, createdAt)),
    ...terminalSlots.map((slot) => createTerminalSlotItem(sessionId, slot, decisions, createdAt)),
    ...agentRun.steps.map((step) => createRunStepItem(sessionId, step, agentRun.id, runtime, decisions, createdAt)),
    ...createMobilePolicyItems(sessionId, mobilePolicy, createdAt),
  ];
  const queue = items.filter((item) => item.state === "required").map(createQueueItem);

  return {
    id: `permission_snapshot_${stableId(`${sessionId}:${items.map((item) => `${item.id}:${item.state}`).join("|")}`)}`,
    sessionId,
    items,
    queue,
    summary: {
      allowed: items.filter((item) => item.decision === "allow").length,
      pending: queue.length,
      approved: items.filter((item) => item.state === "approved").length,
      denied: items.filter((item) => item.decision === "deny" || item.state === "rejected").length,
    },
    createdAt,
  };
}

export function nextRequiredPermission(snapshot: PermissionMatrixSnapshot): ApprovalQueueItem | undefined {
  return snapshot.queue.find((item) => item.state === "required");
}

function createExternalApprovalItem(
  sessionId: string,
  approval: ExternalApprovalItem,
  decisions: Record<string, ApprovalState>,
  createdAt: string,
): PermissionMatrixItem {
  const itemId = `permission_external_${approval.id}`;
  const action = actionFromExternalApproval(approval);
  const requestedState = decisions[itemId] ?? approval.state;
  const state: ApprovalState = action === "unknown_external_effect" ? "rejected" : requestedState;

  return {
    id: itemId,
    sessionId,
    subjectId: approval.ingressEventId,
    actor: "external_channel",
    channel: eventSourceForExternalChannel(approval.channel),
    sourceTrust: approval.channel === "legacy_telegram" || approval.channel === "webhook" ? "untrusted" : "limited",
    action,
    requestedLevels: approval.permissions,
    state,
    decision: decisionFromActionAndState(action, state),
    reason:
      action === "unknown_external_effect"
        ? "unknown external effect is denied by default"
        : state === "approved"
          ? "external request approved by operator"
          : "external request waits behind approval gate",
    createdAt,
  };
}

function createTerminalSlotItem(
  sessionId: string,
  slot: TerminalSlot,
  decisions: Record<string, ApprovalState>,
  createdAt: string,
): PermissionMatrixItem {
  const itemId = `permission_terminal_${slot.id}`;
  const requestedLevels: PermissionLevel[] = slot.permissionState === "not_required" ? [] : ["run_safe_commands"];
  const state = decisions[itemId] ?? slot.permissionState;

  return {
    id: itemId,
    sessionId,
    subjectId: slot.id,
    actor: "agent",
    channel: "desktop",
    sourceTrust: "trusted",
    action: "terminal_run",
    requestedLevels,
    state,
    decision: decisionFromState(state),
    reason:
      state === "not_required"
        ? "local idle slot is display-only"
        : "terminal command preview requires explicit operator approval",
    createdAt,
  };
}

function createRunStepItem(
  sessionId: string,
  step: Stage4RunStep,
  runId: string,
  runtime: RuntimeSnapshot,
  decisions: Record<string, ApprovalState>,
  createdAt: string,
): PermissionMatrixItem {
  const itemId = `permission_run_${step.id}`;
  const state = decisions[itemId] ?? step.permissionState;
  const requestedLevels = levelsForRunStep(step);

  return {
    id: itemId,
    sessionId,
    subjectId: `${runId}:${step.id}`,
    actor: "agent",
    channel: "agent",
    sourceTrust: "trusted",
    action: actionForRunStep(step),
    requestedLevels,
    state,
    decision: decisionFromState(state),
    reason:
      state === "approved"
        ? `approved; DGX status is ${runtime.dgxStatus}`
        : step.permissionState === "required"
          ? "coding handoff can change files or run commands, so it stays gated"
          : "planning and review steps are read-only",
    createdAt,
  };
}

function createMobilePolicyItems(
  sessionId: string,
  mobilePolicy: MobileActionPolicy,
  createdAt: string,
): PermissionMatrixItem[] {
  return [
    {
      id: "permission_mobile_approval",
      sessionId,
      subjectId: "mobile_dashboard",
      actor: "mobile",
      channel: "mobile",
      sourceTrust: "limited",
      action: "mobile_approval",
      requestedLevels: ["read_only"],
      state: mobilePolicy.canApprove ? "not_required" : "rejected",
      decision: mobilePolicy.canApprove ? "allow" : "deny",
      reason: mobilePolicy.canApprove ? "phone can approve, stop, and retry" : "mobile approval disabled",
      createdAt,
    },
    {
      id: "permission_mobile_terminal",
      sessionId,
      subjectId: "mobile_dashboard",
      actor: "mobile",
      channel: "mobile",
      sourceTrust: "limited",
      action: "terminal_run",
      requestedLevels: ["run_safe_commands"],
      state: mobilePolicy.canTypeTerminal ? "required" : "rejected",
      decision: mobilePolicy.canTypeTerminal ? "approval_required" : "deny",
      reason: mobilePolicy.canTypeTerminal ? "mobile terminal would still need approval" : "phone cannot type terminal commands",
      createdAt,
    },
    {
      id: "permission_mobile_secret",
      sessionId,
      subjectId: "mobile_dashboard",
      actor: "mobile",
      channel: "mobile",
      sourceTrust: "limited",
      action: "secret_view",
      requestedLevels: ["secret_access"],
      state: mobilePolicy.canViewSecrets ? "required" : "rejected",
      decision: mobilePolicy.canViewSecrets ? "approval_required" : "deny",
      reason: mobilePolicy.canViewSecrets ? "secret access would be escalated" : "phone cannot view raw secrets",
      createdAt,
    },
  ];
}

function createQueueItem(item: PermissionMatrixItem): ApprovalQueueItem {
  return {
    id: `queue_${item.id}`,
    sourceItemId: item.id,
    summary: `${item.action} from ${item.actor}`,
    requestedBy: item.actor,
    permissions: item.requestedLevels,
    state: item.state,
    createdAt: item.createdAt,
  };
}

function decisionFromState(state: ApprovalState): PermissionDecision {
  if (state === "approved" || state === "not_required") {
    return "allow";
  }

  if (state === "rejected" || state === "expired") {
    return "deny";
  }

  return "approval_required";
}

function decisionFromActionAndState(action: PermissionAction, state: ApprovalState): PermissionDecision {
  if (action === "unknown_external_effect") {
    return "deny";
  }

  return decisionFromState(state);
}

function eventSourceForExternalChannel(channel: ExternalApprovalItem["channel"]): EventSource {
  if (channel === "legacy_telegram") {
    return "legacy_telegram";
  }

  if (channel === "mobile") {
    return "mobile";
  }

  return "api";
}

function actionFromExternalApproval(approval: ExternalApprovalItem): PermissionAction {
  const permissionAction = actionFromPermissions(approval.permissions);
  if (permissionAction !== "unknown_external_effect") {
    return permissionAction;
  }

  const summary = approval.summary.toLowerCase();
  if (/(email|mail|메일|이메일)/i.test(summary)) {
    return "email_send";
  }

  if (/(customer|고객|문의|cs|reply|답변|응답|channeltalk|채널톡)/i.test(summary)) {
    return "customer_reply";
  }

  if (/(slack|telegram|message|dm|카톡|텔레그램|메시지)/i.test(summary)) {
    return "external_message_send";
  }

  if (/(share|공유|document|문서)/i.test(summary)) {
    return "document_share";
  }

  if (/(calendar|일정|meeting|회의)/i.test(summary)) {
    return "calendar_create";
  }

  if (/(quote|견적)/i.test(summary)) {
    return "quote_send";
  }

  if (/(invoice|청구|세금계산서)/i.test(summary)) {
    return "invoice_create";
  }

  if (/(payment|refund|결제|환불)/i.test(summary)) {
    return "payment_action";
  }

  if (/(contract|계약|legal|법무)/i.test(summary)) {
    return "contract_review";
  }

  if (/(deploy|배포|release)/i.test(summary)) {
    return "deploy";
  }

  if (/(git push|push|푸시)/i.test(summary)) {
    return "git_push";
  }

  return "unknown_external_effect";
}

function actionFromPermissions(permissions: PermissionLevel[]): PermissionAction {
  if (permissions.includes("secret_access")) {
    return "secret_view";
  }

  if (permissions.includes("write_files")) {
    return "file_write";
  }

  if (permissions.includes("remote_workspace")) {
    return "remote_workspace";
  }

  if (permissions.includes("run_safe_commands") || permissions.includes("run_dangerous_commands")) {
    return "terminal_run";
  }

  return "unknown_external_effect";
}

function actionForRunStep(step: Stage4RunStep): PermissionAction {
  return step.permissionState === "required" ? "remote_workspace" : "conversation_reply";
}

function levelsForRunStep(step: Stage4RunStep): PermissionLevel[] {
  return step.permissionState === "required" ? ["write_files", "run_safe_commands", "remote_workspace"] : ["read_only"];
}

function stableId(value: string) {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(16);
}
