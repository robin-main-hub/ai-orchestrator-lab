import { describe, expect, it } from "vitest";
import type { ApprovalQueueItem, ApprovalRequest, PermissionMatrixSnapshot } from "@ai-orchestrator/protocol";
import type { DesktopApprovalListResponse } from "../runtime/stage34ApprovalServer";
import { createUnifiedControlQueueSnapshot, parseUnifiedControlQueueSourceItemId } from "./controlQueueUnifiedApprovals";

const localQueueItem: ApprovalQueueItem = {
  action: "terminal_run",
  createdAt: "2026-06-05T08:01:00.000Z",
  id: "queue_local_terminal",
  permissions: ["run_dangerous_commands"],
  reason: "로컬 터미널 실행 확인",
  requestedBy: "agent",
  sourceItemId: "permission_local_terminal",
  sourceTrust: "trusted",
  state: "required",
  summary: "로컬 터미널 실행 승인 필요",
};

const permissionSnapshot: PermissionMatrixSnapshot = {
  createdAt: "2026-06-05T08:00:00.000Z",
  id: "permission_snapshot_test",
  items: [],
  queue: [localQueueItem],
  sessionId: "session_main",
  summary: {
    allowed: 1,
    approved: 2,
    denied: 0,
    pending: 1,
  },
};

const serverApproval: ApprovalRequest = {
  action: "provider_completion",
  actor: "agent",
  channel: "server",
  createdAt: "2026-06-05T08:03:00.000Z",
  decision: "approval_required",
  id: "approval_server_provider",
  reason: "DGX provider replay requires approval",
  requestedLevels: ["secret_access"],
  replay: {
    endpoint: "/approvals/replay",
    kind: "provider_completion",
    method: "POST",
    payload: { providerProfileId: "provider_mimo_token_openai" },
  },
  sessionId: "session_main",
  sourceItemId: "permission_server_provider",
  sourceTrust: "limited",
  state: "required",
  subjectId: "provider_mimo_token_openai",
};

const approvalServerSnapshot: DesktopApprovalListResponse = {
  approvals: [serverApproval],
  queue: [],
};

describe("createUnifiedControlQueueSnapshot", () => {
  it("로컬 권한 큐와 DGX 서버 승인 큐를 최신순 단일 큐로 합친다", () => {
    const unified = createUnifiedControlQueueSnapshot({
      approvalServerSnapshot,
      permissionSnapshot,
    });

    expect(unified.queue.map((item) => item.sourceItemId)).toEqual([
      "server:approval_server_provider",
      "permission_local_terminal",
    ]);
    expect(unified.summary.pending).toBe(2);
    expect(unified.summary.approved).toBe(permissionSnapshot.summary.approved);
    expect(unified.queue[0]).toMatchObject({
      action: "provider_completion",
      permissions: ["secret_access"],
      replayEndpoint: "/approvals/replay",
      replayKind: "provider_completion",
      requestedBy: "server",
      sourceTrust: "limited",
      summary: "모델 호출 · DGX provider replay requires approval",
    });
  });

  it("server sourceItemId를 approvalId로 안전하게 역해석한다", () => {
    expect(parseUnifiedControlQueueSourceItemId("server:approval_server_provider")).toEqual({
      approvalId: "approval_server_provider",
      kind: "server",
    });
    expect(parseUnifiedControlQueueSourceItemId("permission_local_terminal")).toEqual({
      kind: "local",
      sourceItemId: "permission_local_terminal",
    });
  });
});
