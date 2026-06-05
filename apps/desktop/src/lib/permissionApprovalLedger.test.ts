import { describe, expect, it } from "vitest";
import type { PermissionMatrixSnapshot } from "@ai-orchestrator/protocol";
import { createPermissionApprovalLedger } from "./permissionApprovalLedger";

const snapshot: PermissionMatrixSnapshot = {
  id: "permission_snapshot_test",
  sessionId: "session_main",
  createdAt: "2026-06-05T08:00:00.000Z",
  items: [
    {
      id: "permission_terminal_slot_1",
      sessionId: "session_main",
      subjectId: "terminal_slot_1",
      actor: "agent",
      channel: "desktop",
      sourceTrust: "trusted",
      action: "terminal_run",
      requestedLevels: ["run_dangerous_commands", "remote_workspace"],
      state: "required",
      decision: "approval_required",
      reason: "tool input {\"command\":\"deploy\"} Bearer abc123 https://internal.example.test /Users/robin/project sk-live-secret",
      createdAt: "2026-06-05T08:01:00.000Z",
    },
    {
      id: "permission_external_webhook_1",
      sessionId: "session_main",
      subjectId: "external_event_1",
      actor: "external_channel",
      channel: "api",
      sourceTrust: "untrusted",
      action: "customer_reply",
      requestedLevels: ["read_only"],
      state: "rejected",
      decision: "deny",
      reason: "untrusted external source must pass explicit approval",
      createdAt: "2026-06-05T08:02:00.000Z",
    },
  ],
  queue: [
    {
      id: "queue_permission_terminal_slot_1",
      sourceItemId: "permission_terminal_slot_1",
      summary: "터미널 실행 승인 필요",
      requestedBy: "agent",
      action: "terminal_run",
      reason: "위험 명령 실행 승인 필요",
      sourceTrust: "trusted",
      permissions: ["run_dangerous_commands", "remote_workspace"],
      state: "required",
      createdAt: "2026-06-05T08:01:00.000Z",
      replayKind: "tmux_dispatch",
      replayEndpoint: "/approvals/replay",
    },
  ],
  summary: {
    allowed: 0,
    approved: 0,
    denied: 1,
    pending: 1,
  },
};

describe("permissionApprovalLedger", () => {
  it("projects permission matrix items into readable cockpit ledger records", () => {
    const ledger = createPermissionApprovalLedger({
      decisionEvents: [
        {
          id: "event_permission_update",
          sessionId: "session_main",
          type: "permission.queue.updated",
          payload: {
            decidedAt: "2026-06-05T08:04:00.000Z",
            decidedBy: "desktop_operator",
            sourceItemId: "permission_terminal_slot_1",
            state: "approved",
          },
          createdAt: "2026-06-05T08:04:00.000Z",
          source: "desktop",
          sourceTrust: "trusted",
          redacted: true,
        },
      ],
      permissionSnapshot: snapshot,
    });

    expect(ledger).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dispatchId: "permission_terminal_slot_1",
          requesterAgentId: "desktop_operator",
          approvalState: "approved",
          actionSummary: "터미널 실행",
          ledgerDigest: expect.stringMatching(/^ledger:/),
          policyCode: "OPERATOR-APPROVED",
          createdAt: "2026-06-05T08:04:00.000Z",
          decisionReason: expect.stringContaining("도구 입력 [redacted]"),
        }),
      ]),
    );
  });

  it("redacts secrets and marks untrusted sources without claiming verified replay", () => {
    const ledger = createPermissionApprovalLedger({ permissionSnapshot: snapshot });
    const combined = ledger.map((item) => `${item.actionSummary} ${item.decisionReason} ${item.replayPayloadDigest}`).join("\n");
    const untrusted = ledger.find((item) => item.dispatchId === "permission_external_webhook_1");

    expect(combined).not.toContain("Bearer abc123");
    expect(combined).not.toContain("https://internal.example.test");
    expect(combined).not.toContain("/Users/robin");
    expect(combined).not.toContain("sk-live-secret");
    expect(untrusted).toEqual(
      expect.objectContaining({
        tamperWarning: true,
        tamperReason: "비신뢰 출처: api",
        policyCode: "TRUST-UNTRUSTED",
      }),
    );
  });

  it("keeps tmux outcomes as execution records with safe Korean reasons", () => {
    const ledger = createPermissionApprovalLedger({
      permissionSnapshot: snapshot,
      tmuxRedispatchOutcomes: [
        {
          approvalId: "approval_tmux_1",
          createdAt: "2026-06-05T08:03:00.000Z",
          reason: "sent to /Users/robin/private with API_KEY=value",
          role: "code",
          sourceItemId: "permission_terminal_slot_1",
          status: "sent",
        },
      ],
    });
    const tmux = ledger.find((item) => item.dispatchId === "approval_tmux_1");

    expect(tmux).toEqual(
      expect.objectContaining({
        approvalState: "approved",
        actionSummary: "tmux 전송",
        decisionReason: "sent to [local-path] with [secret]",
        policyCode: "OPERATOR-APPROVED",
      }),
    );
  });
});
