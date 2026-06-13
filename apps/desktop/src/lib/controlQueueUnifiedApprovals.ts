import type { ApprovalQueueItem, ApprovalRequest, PermissionMatrixSnapshot } from "@ai-orchestrator/protocol";
import type { DesktopApprovalListResponse } from "../runtime/stage34ApprovalServer";
import { controlQueueActionLabel } from "./controlQueuePresentation";

const SERVER_APPROVAL_SOURCE_PREFIX = "server:";

export type UnifiedControlQueueSnapshot = PermissionMatrixSnapshot;

export type UnifiedControlQueueSource =
  | {
      kind: "server";
      approvalId: string;
    }
  | {
      kind: "local";
      sourceItemId: string;
    };

export function createUnifiedControlQueueSnapshot({
  approvalServerSnapshot,
  permissionSnapshot,
}: {
  approvalServerSnapshot?: DesktopApprovalListResponse;
  permissionSnapshot: PermissionMatrixSnapshot;
}): UnifiedControlQueueSnapshot {
  const serverQueue = createServerApprovalQueueItems(approvalServerSnapshot?.approvals ?? []);
  const queue = [...permissionSnapshot.queue, ...serverQueue].sort(
    (left, right) => timestampOf(right.createdAt) - timestampOf(left.createdAt),
  );

  return {
    ...permissionSnapshot,
    queue,
    summary: {
      ...permissionSnapshot.summary,
      pending: queue.filter((item) => item.state === "required").length,
    },
  };
}

export function parseUnifiedControlQueueSourceItemId(sourceItemId: string): UnifiedControlQueueSource {
  if (sourceItemId.startsWith(SERVER_APPROVAL_SOURCE_PREFIX)) {
    return {
      approvalId: sourceItemId.slice(SERVER_APPROVAL_SOURCE_PREFIX.length),
      kind: "server",
    };
  }

  return {
    kind: "local",
    sourceItemId,
  };
}

/**
 * Pulls the redaction-safe command preview out of a replay payload. The queue
 * is an honesty surface, so we use ONLY `redactedCommandPreview` (secrets already
 * masked) — never the raw `commandPreview` — to avoid leaking a token in an arg.
 * Absent/blank ⇒ undefined (no command shown), never synthesized from the reason.
 */
function redactedCommandPreviewFromReplay(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const value = (payload as Record<string, unknown>).redactedCommandPreview;
  return typeof value === "string" && value.trim() ? value : undefined;
}

function createServerApprovalQueueItems(approvals: ApprovalRequest[]): ApprovalQueueItem[] {
  return approvals
    .filter((approval) => approval.state === "required")
    .map((approval) => ({
      action: approval.action,
      costEstimateTokens: approval.costEstimateTokens,
      commandPreview: redactedCommandPreviewFromReplay(approval.replay?.payload),
      createdAt: approval.createdAt,
      expiresAt: approval.expiresAt,
      id: `queue_${approval.id}`,
      permissions: approval.requestedLevels,
      reason: approval.reason,
      replayEndpoint: approval.replay?.endpoint,
      replayKind: approval.replay?.kind,
      requestedBy: "server",
      sourceItemId: `${SERVER_APPROVAL_SOURCE_PREFIX}${approval.id}`,
      sourceTrust: approval.sourceTrust,
      state: approval.state,
      summary: `${controlQueueActionLabel(approval.action)} · ${approval.reason}`,
    }));
}

function timestampOf(value?: string) {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}
