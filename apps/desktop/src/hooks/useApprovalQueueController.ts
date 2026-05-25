import { useState } from "react";
import type { ApprovalRequest, ApprovalState } from "@ai-orchestrator/protocol";
import {
  requestTmuxDispatch,
  requestTmuxPreflight,
  type DesktopTmuxDispatchRequest,
} from "../runtime/stage33TmuxServer";
import {
  fetchDgxApprovalQueue,
  grantDgxApproval,
  replayDgxApproval,
  rejectDgxApproval,
  type DesktopApprovalListResponse,
} from "../runtime/stage34ApprovalServer";
import type { TmuxRedispatchOutcome } from "../components/OperationsRailPanel";

export type ApprovalQueueController = {
  approvalServerSnapshot?: DesktopApprovalListResponse;
  approvalServerStatus: "idle" | "loading" | "error" | "ready";
  approvalServerError: string;
  approvalServerBusyId?: string;
  pendingTmuxApprovalKeys: string[];
  tmuxRedispatchOutcomes: TmuxRedispatchOutcome[];
  handleRefreshApprovalQueue: () => Promise<void>;
  handleTmuxApprovalQueued: (input: {
    approval: ApprovalRequest;
    request: DesktopTmuxDispatchRequest;
  }) => Promise<void>;
  handleResolveServerApproval: (
    approval: ApprovalRequest,
    state: Extract<ApprovalState, "approved" | "rejected">,
  ) => Promise<void>;
};

export type UseApprovalQueueControllerParams = {
  appendEvent: (type: string, payload: unknown) => void;
};

export function useApprovalQueueController({ appendEvent }: UseApprovalQueueControllerParams): ApprovalQueueController {
  const [approvalServerSnapshot, setApprovalServerSnapshot] = useState<DesktopApprovalListResponse>();
  const [approvalServerStatus, setApprovalServerStatus] = useState<"idle" | "loading" | "error" | "ready">("idle");
  const [approvalServerError, setApprovalServerError] = useState("");
  const [approvalServerBusyId, setApprovalServerBusyId] = useState<string>();
  const [pendingTmuxDispatchByApprovalKey, setPendingTmuxDispatchByApprovalKey] = useState<
    Record<string, DesktopTmuxDispatchRequest>
  >({});
  const [tmuxRedispatchOutcomes, setTmuxRedispatchOutcomes] = useState<TmuxRedispatchOutcome[]>([]);

  async function handleRefreshApprovalQueue() {
    setApprovalServerStatus("loading");
    setApprovalServerError("");
    try {
      const snapshot = await fetchDgxApprovalQueue();
      setApprovalServerSnapshot(snapshot);
      setApprovalServerStatus("ready");
      appendEvent("approval.queue.refreshed", {
        authorityNodeId: "dgx-02",
        approvalCount: snapshot.approvals.length,
        pendingCount: snapshot.queue.length,
        redaction: "applied",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setApprovalServerStatus("error");
      setApprovalServerError(message);
      appendEvent("approval.queue.refresh_failed", {
        authorityNodeId: "dgx-02",
        message,
        redaction: "applied",
      });
    }
  }

  async function handleTmuxApprovalQueued({
    approval,
    request,
  }: {
    approval: ApprovalRequest;
    request: DesktopTmuxDispatchRequest;
  }) {
    setPendingTmuxDispatchByApprovalKey((current) => ({
      ...current,
      [approval.id]: request,
      ...(approval.sourceItemId ? { [approval.sourceItemId]: request } : {}),
    }));
    appendEvent("tmux.dispatch.approval_queued", {
      approvalId: approval.id,
      sourceItemId: approval.sourceItemId,
      role: request.role,
      paneId: request.paneId,
      authorityNodeId: "dgx-02",
      redaction: "applied",
    });
    await handleRefreshApprovalQueue();
  }

  async function handleResolveServerApproval(
    approval: ApprovalRequest,
    state: Extract<ApprovalState, "approved" | "rejected">,
  ) {
    const decidedAt = new Date().toISOString();
    setApprovalServerBusyId(approval.id);
    setApprovalServerError("");
    try {
      const request = {
        approvalId: approval.id,
        actor: "user" as const,
        reason: `desktop operator ${state}`,
        decidedAt,
      };
      const result =
        state === "approved"
          ? await grantDgxApproval({ request })
          : await rejectDgxApproval({ request });

      if ("error" in result) {
        throw new Error(result.error);
      }

      appendEvent(`approval.server.${state}`, {
        approvalId: approval.id,
        sourceItemId: approval.sourceItemId,
        action: approval.action,
        status: result.status,
        authorityNodeId: "dgx-02",
        redaction: "applied",
      });
      let replayedByServer = false;
      if (state === "approved" && approval.replay) {
        try {
          const replay = await replayDgxApproval({ request });
          replayedByServer = replay.status === "replayed";
          appendEvent("approval.server.replay_requested", {
            approvalId: approval.id,
            sourceItemId: approval.sourceItemId,
            replayKind: approval.replay.kind,
            replayStatus: replay.status,
            authorityNodeId: "dgx-02",
            redaction: "applied",
          });
          if (approval.replay.kind === "tmux_dispatch" && replay.status === "replayed") {
            const dispatch = extractTmuxDispatchReplay(replay.result);
            const outcome: TmuxRedispatchOutcome = {
              approvalId: approval.id,
              createdAt: new Date().toISOString(),
              reason: dispatch?.reason ?? "server replay completed",
              role: extractReplayRole(approval.replay.payload) ?? "orchestrator",
              sourceItemId: approval.sourceItemId,
              status: dispatch?.status ?? "recorded",
            };
            setTmuxRedispatchOutcomes((current) => [outcome, ...current].slice(0, 5));
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          appendEvent("approval.server.replay_failed", {
            approvalId: approval.id,
            sourceItemId: approval.sourceItemId,
            replayKind: approval.replay.kind,
            message,
            authorityNodeId: "dgx-02",
            redaction: "applied",
          });
        }
      }
      const pendingTmuxRequest =
        pendingTmuxDispatchByApprovalKey[approval.id] ??
        (approval.sourceItemId ? pendingTmuxDispatchByApprovalKey[approval.sourceItemId] : undefined);
      if (state === "approved" && pendingTmuxRequest && !replayedByServer) {
        try {
          const approvedRequest: DesktopTmuxDispatchRequest = {
            ...pendingTmuxRequest,
            id: `${pendingTmuxRequest.id}_approved_${Date.now()}`,
            approvalState: "approved",
            dispatchMode: "execute_if_approved",
            createdAt: decidedAt,
          };
          const preflight = await requestTmuxPreflight({ request: approvedRequest });
          appendEvent("tmux.dispatch.preflight_checked", {
            approvalId: approval.id,
            sourceItemId: approval.sourceItemId,
            approvedRequestId: approvedRequest.id,
            role: approvedRequest.role,
            permissionDecision: preflight.permission.decision,
            wouldAttemptSendKeys: preflight.audit.wouldAttemptSendKeys,
            dryRunEnabled: preflight.audit.dryRunEnabled,
            sendKeysEnabled: preflight.audit.sendKeysEnabled,
            timelineBlockCount: preflight.timelineBlocks?.length ?? 0,
            authorityNodeId: "dgx-02",
            redaction: "applied",
          });
          if (preflight.permission.decision === "deny") {
            throw new Error(preflight.permission.reason);
          }
          const approvedDispatch = await requestTmuxDispatch({
            request: approvedRequest,
          });
          appendEvent("tmux.dispatch.approval_applied", {
            approvalId: approval.id,
            sourceItemId: approval.sourceItemId,
            originalRequestId: pendingTmuxRequest.id,
            approvedRequestId: approvedDispatch.intent.id,
            role: pendingTmuxRequest.role,
            dispatchStatus: approvedDispatch.dispatch.status,
            dispatchAttempted: approvedDispatch.dispatch.attempted,
            dispatchReason: approvedDispatch.dispatch.reason,
            timelineBlockCount: approvedDispatch.timelineBlocks?.length ?? 0,
            authorityNodeId: "dgx-02",
            redaction: "applied",
          });
          const outcome: TmuxRedispatchOutcome = {
            approvalId: approval.id,
            createdAt: new Date().toISOString(),
            reason: approvedDispatch.dispatch.reason,
            role: pendingTmuxRequest.role,
            sourceItemId: approval.sourceItemId,
            status: approvedDispatch.dispatch.status,
          };
          setTmuxRedispatchOutcomes((current) => [outcome, ...current].slice(0, 5));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setApprovalServerError(`승인은 완료됐지만 tmux 재전송에 실패: ${message}`);
          appendEvent("tmux.dispatch.approval_apply_failed", {
            approvalId: approval.id,
            sourceItemId: approval.sourceItemId,
            originalRequestId: pendingTmuxRequest.id,
            message,
            authorityNodeId: "dgx-02",
            redaction: "applied",
          });
          const outcome: TmuxRedispatchOutcome = {
            approvalId: approval.id,
            createdAt: new Date().toISOString(),
            reason: message,
            role: pendingTmuxRequest.role,
            sourceItemId: approval.sourceItemId,
            status: "failed",
          };
          setTmuxRedispatchOutcomes((current) => [outcome, ...current].slice(0, 5));
        }
      }
      if (pendingTmuxRequest || state === "rejected") {
        setPendingTmuxDispatchByApprovalKey((current) => {
          const next = { ...current };
          delete next[approval.id];
          if (approval.sourceItemId) {
            delete next[approval.sourceItemId];
          }
          return next;
        });
      }
      await handleRefreshApprovalQueue();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setApprovalServerStatus("error");
      setApprovalServerError(message);
      appendEvent(`approval.server.${state}_failed`, {
        approvalId: approval.id,
        message,
        authorityNodeId: "dgx-02",
        redaction: "applied",
      });
    } finally {
      setApprovalServerBusyId(undefined);
    }
  }

  return {
    approvalServerSnapshot,
    approvalServerStatus,
    approvalServerError,
    approvalServerBusyId,
    pendingTmuxApprovalKeys: Object.keys(pendingTmuxDispatchByApprovalKey),
    tmuxRedispatchOutcomes,
    handleRefreshApprovalQueue,
    handleTmuxApprovalQueued,
    handleResolveServerApproval,
  };
}

function extractTmuxDispatchReplay(result: unknown): { reason?: string; status?: TmuxRedispatchOutcome["status"] } | undefined {
  if (!result || typeof result !== "object") {
    return undefined;
  }
  const dispatch = (result as { dispatch?: unknown }).dispatch;
  if (!dispatch || typeof dispatch !== "object") {
    return undefined;
  }
  const status = (dispatch as { status?: unknown }).status;
  const reason = (dispatch as { reason?: unknown }).reason;
  return {
    reason: typeof reason === "string" ? reason : undefined,
    status: isTmuxRedispatchStatus(status) ? status : undefined,
  };
}

function extractReplayRole(payload: unknown): TmuxRedispatchOutcome["role"] | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const role = (payload as { role?: unknown }).role;
  return typeof role === "string" ? role : undefined;
}

function isTmuxRedispatchStatus(value: unknown): value is TmuxRedispatchOutcome["status"] {
  return (
    value === "sent" ||
    value === "failed" ||
    value === "blocked" ||
    value === "recorded" ||
    value === "pending_approval" ||
    value === "dry_run"
  );
}
