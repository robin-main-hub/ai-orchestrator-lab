import { describe, expect, it } from "vitest";
import { requestTmuxCapture, requestTmuxDispatch, requestTmuxPreflight } from "./stage33TmuxServer";

describe("stage33 tmux server runtime", () => {
  it("posts tmux dispatch intents through the DGX server with auth headers", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const result = await requestTmuxDispatch({
      serverBaseUrl: "http://dgx-02:4317",
      request: {
        id: "tmux_dispatch_desktop_test",
        sessionId: "session_desktop_001",
        role: "architect",
        commandPreview: "pnpm typecheck",
        dispatchMode: "execute_if_approved",
      },
      fetchImpl: async (url: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        return jsonResponse({
          intent: {
            id: "tmux_dispatch_desktop_test",
            sessionId: "session_desktop_001",
            terminalSessionId: "terminal_session_ai_swarm",
            paneId: "role:architect",
            requestedBy: "user",
            commandPreview: "pnpm typecheck",
            redactedCommandPreview: "pnpm typecheck",
            requestedPermissions: ["run_safe_commands", "remote_workspace"],
            approvalState: "required",
            dispatchState: "pending_approval",
            createdAt: "2026-05-25T00:00:00.000Z",
          },
          permission: {
            decision: "approval_required",
            requestedLevels: ["run_safe_commands", "remote_workspace"],
            reason: "tmux dispatch requires explicit approval before send-keys can run",
          },
          approval: {
            id: "approval_tmux_dispatch_desktop_test",
            sessionId: "session_desktop_001",
            sourceItemId: "tmux_dispatch_desktop_test",
            subjectId: "dgx_02:ai-swarm:architect",
            actor: "user",
            channel: "desktop",
            sourceTrust: "trusted",
            action: "terminal_run",
            requestedLevels: ["run_safe_commands", "remote_workspace"],
            decision: "approval_required",
            state: "required",
            reason: "tmux dispatch requires explicit approval before send-keys can run",
            createdAt: "2026-05-25T00:00:00.000Z",
          },
          dispatch: {
            attempted: false,
            status: "pending_approval",
            reason: "tmux dispatch recorded and queued for approval",
          },
        });
      },
    });

    expect(calls[0]?.url).toBe("http://dgx-02:4317/tmux/dispatch");
    expect((calls[0]?.init?.headers as Record<string, string>).authorization).toMatch(/^Bearer \S+/);
    expect(result.permission.decision).toBe("approval_required");
    expect(result.dispatch.status).toBe("pending_approval");
  });

  it("posts read-only capture requests and accepts disabled server responses", async () => {
    const result = await requestTmuxCapture({
      serverBaseUrl: "http://dgx-02:4317",
      request: {
        id: "tmux_capture_desktop_test",
        sessionId: "session_desktop_001",
        role: "qa",
        lines: 80,
      },
      fetchImpl: async (url: RequestInfo | URL, init?: RequestInit) => {
        expect(String(url)).toBe("http://dgx-02:4317/tmux/capture");
        expect((init?.headers as Record<string, string>).authorization).toMatch(/^Bearer \S+/);
        return jsonResponse({
          status: "disabled",
          reason: "ORCHESTRATOR_ENABLE_TMUX_CAPTURE is not enabled on this server",
        });
      },
    });

    expect(result.status).toBe("disabled");
    expect(result.reason).toContain("ORCHESTRATOR_ENABLE_TMUX_CAPTURE");
  });

  it("posts side-effect-free tmux preflight requests", async () => {
    const result = await requestTmuxPreflight({
      serverBaseUrl: "http://dgx-02:4317",
      request: {
        id: "tmux_preflight_desktop_test",
        sessionId: "session_desktop_001",
        role: "qa",
        commandPreview: "pnpm test",
        dispatchMode: "execute_if_approved",
      },
      fetchImpl: async (url: RequestInfo | URL, init?: RequestInit) => {
        expect(String(url)).toBe("http://dgx-02:4317/tmux/preflight");
        expect((init?.headers as Record<string, string>).authorization).toMatch(/^Bearer \S+/);
        return jsonResponse({
          intent: {
            id: "tmux_preflight_desktop_test",
            sessionId: "session_desktop_001",
            terminalSessionId: "terminal_session_ai_swarm",
            paneId: "role:qa",
            requestedBy: "user",
            commandPreview: "pnpm test",
            redactedCommandPreview: "pnpm test",
            requestedPermissions: ["run_safe_commands"],
            approvalState: "required",
            dispatchState: "pending_approval",
            createdAt: "2026-05-25T00:00:00.000Z",
          },
          permission: {
            decision: "approval_required",
            requestedLevels: ["run_safe_commands"],
            reason: "tmux dispatch requires explicit approval before send-keys can run",
          },
          audit: {
            redactionApplied: false,
            wouldRecordEvents: ["terminal.command.intent.created", "approval.requested"],
            wouldQueueApproval: true,
            wouldAttemptSendKeys: false,
            dryRunEnabled: true,
            sendKeysEnabled: false,
            replayEndpoint: "/tmux/dispatch",
            checks: [{ id: "permission", status: "warn", message: "approval required" }],
          },
        });
      },
    });

    expect(result.audit.wouldQueueApproval).toBe(true);
    expect(result.audit.wouldRecordEvents).toContain("approval.requested");
  });

  it("falls back across DGX server base URLs", async () => {
    const calls: string[] = [];
    const result = await requestTmuxCapture({
      serverBaseUrl: ["http://dgx-02:4317", "https://orchestrator.endruin.com"],
      request: {
        id: "tmux_capture_fallback_test",
        sessionId: "session_desktop_001",
        role: "status",
      },
      fetchImpl: async (url: RequestInfo | URL) => {
        calls.push(String(url));
        if (calls.length === 1) {
          throw new Error("network_error");
        }
        return jsonResponse({
          status: "captured",
          reason: "tmux pane output captured and redacted",
          payload: {
            terminalSessionId: "terminal_session_ai_swarm",
            paneId: "role:status",
            role: "status",
            outputPreview: "ready",
            lineCount: 1,
            redactionApplied: false,
            capturedAt: "2026-05-25T00:00:00.000Z",
          },
        });
      },
    });

    expect(calls).toEqual(["http://dgx-02:4317/tmux/capture", "https://orchestrator.endruin.com/tmux/capture"]);
    expect(result.status).toBe("captured");
    expect(result.payload?.outputPreview).toBe("ready");
  });
});

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(payload);
    },
  } as Response;
}
