import { describe, expect, it } from "vitest";
import {
  fetchDgxApprovalQueue,
  grantDgxApproval,
  rejectDgxApproval,
} from "./stage34ApprovalServer";
import { DGX02_LAN_ORCHESTRATOR_BASE_URL } from "./stage30DgxEndpoints";

describe("stage34 approval server runtime", () => {
  it("fetches the DGX approval queue with bearer headers", async () => {
    const response = await fetchDgxApprovalQueue({
      fetchImpl: async (url, init) => {
        expect(String(url)).toBe(`${DGX02_LAN_ORCHESTRATOR_BASE_URL}/approvals/list`);
        expect(init?.method).toBe("GET");
        expect((init?.headers as Record<string, string>).authorization).toMatch(/^Bearer \S+/);

        return jsonResponse({
          approvals: [
            {
              id: "approval_tmux_1",
              sessionId: "session_desktop_001",
              sourceItemId: "tmux_dispatch_1",
              subjectId: "role:architect",
              actor: "agent",
              channel: "desktop",
              sourceTrust: "trusted",
              action: "terminal_run",
              requestedLevels: ["run_safe_commands"],
              decision: "approval_required",
              state: "required",
              reason: "tmux dispatch waits for approval",
              createdAt: "2026-05-25T00:00:00.000Z",
            },
          ],
          queue: [
            {
              id: "queue_tmux_1",
              sourceItemId: "tmux_dispatch_1",
              summary: "terminal_run from agent",
              requestedBy: "agent",
              permissions: ["run_safe_commands"],
              state: "required",
              createdAt: "2026-05-25T00:00:00.000Z",
            },
          ],
        });
      },
    });

    expect(response.approvals[0]?.id).toBe("approval_tmux_1");
    expect(response.queue[0]?.summary).toBe("terminal_run from agent");
  });

  it("posts approval grants to the DGX server", async () => {
    const response = await grantDgxApproval({
      request: {
        approvalId: "approval_tmux_1",
        actor: "user",
        reason: "operator approved in desktop",
      },
      fetchImpl: async (url, init) => {
        expect(String(url)).toBe(`${DGX02_LAN_ORCHESTRATOR_BASE_URL}/approvals/grant`);
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toMatchObject({
          approvalId: "approval_tmux_1",
          actor: "user",
        });

        return jsonResponse({
          approval: { id: "approval_tmux_1", state: "approved" },
          event: { id: "event_approval_granted", type: "approval.granted" },
          status: "approved",
        });
      },
    });

    expect("status" in response ? response.status : undefined).toBe("approved");
  });

  it("falls back to the public endpoint when the LAN approval queue is unavailable", async () => {
    const calls: string[] = [];
    const response = await rejectDgxApproval({
      request: {
        sourceItemId: "tmux_dispatch_1",
        actor: "user",
      },
      fetchImpl: async (url) => {
        calls.push(String(url));
        if (calls.length === 1) {
          throw new Error("LAN blocked");
        }

        return jsonResponse({
          approval: { id: "approval_tmux_1", state: "rejected" },
          event: { id: "event_approval_rejected", type: "approval.rejected" },
          status: "rejected",
        });
      },
    });

    expect(calls).toEqual([
      `${DGX02_LAN_ORCHESTRATOR_BASE_URL}/approvals/reject`,
      "https://orchestrator.endruin.com/approvals/reject",
    ]);
    expect("status" in response ? response.status : undefined).toBe("rejected");
  });
});

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), { status: 200 });
}
