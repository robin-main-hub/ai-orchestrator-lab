import { describe, expect, it } from "vitest";
import { requestTmuxCapture, requestTmuxDispatch, requestTmuxPreflight } from "./stage33TmuxServer";

function expectHttpHmacHeaders(headers: Record<string, string>) {
  expect(headers.authorization).toBeUndefined();
  expect(headers["x-dgx-signature"]).toMatch(/^[a-f0-9]{64}$/);
  expect(headers["x-dgx-timestamp"]).toMatch(/^\d+$/);
  expect(headers["x-dgx-nonce"]).toBeTruthy();
}

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
    expectHttpHmacHeaders(calls[0]?.init?.headers as Record<string, string>);
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
        expectHttpHmacHeaders(init?.headers as Record<string, string>);
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
        expectHttpHmacHeaders(init?.headers as Record<string, string>);
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

// Characterization tests for previously-uncovered stage33 tmux-server transport
// branches (no behavior change, no real network, no secret). These pin the
// authority-adjacent remote-execution dispatch seam: a 403 is treated as a
// permission-required body (parsed and returned, not thrown, no failover), a
// non-403 non-ok status falls through to the next base URL, an all-endpoints-
// failed aggregate joins each base URL's error with " | ", and the non-ok error
// message truncates the response body to 180 chars.
describe("stage33 tmux server — transport carve-out characterization", () => {
  const lanBase = "http://dgx-02:4317";
  const publicBase = "https://orchestrator.endruin.com";

  it("treats a 403 as a permission-required body, returning it without failover", async () => {
    const calls: string[] = [];
    const result = await requestTmuxDispatch({
      serverBaseUrl: [lanBase, publicBase],
      request: {
        id: "tmux_dispatch_403",
        sessionId: "session_desktop_001",
        role: "architect",
        commandPreview: "pnpm typecheck",
        dispatchMode: "execute_if_approved",
      },
      fetchImpl: async (url) => {
        calls.push(String(url));
        return jsonResponse(
          {
            intent: { id: "tmux_dispatch_403" },
            permission: {
              decision: "approval_required",
              requestedLevels: ["run_safe_commands"],
              reason: "tmux dispatch requires explicit approval before send-keys can run",
            },
            dispatch: {
              attempted: false,
              status: "pending_approval",
              reason: "tmux dispatch recorded and queued for approval",
            },
          },
          403,
        );
      },
    });

    // 403 is parsed, not thrown — the second base URL is never contacted
    expect(calls).toEqual([`${lanBase}/tmux/dispatch`]);
    expect(result.permission.decision).toBe("approval_required");
    expect(result.dispatch.status).toBe("pending_approval");
  });

  it("falls through to the next base URL when the first returns a non-403 non-ok status", async () => {
    const calls: string[] = [];
    const result = await requestTmuxCapture({
      serverBaseUrl: [lanBase, publicBase],
      request: { id: "tmux_capture_500", sessionId: "session_desktop_001", role: "status" },
      fetchImpl: async (url) => {
        calls.push(String(url));
        if (calls.length === 1) {
          return jsonResponse({ error: "upstream draining" }, 503);
        }
        return jsonResponse({ status: "disabled", reason: "capture disabled" });
      },
    });

    expect(calls).toEqual([`${lanBase}/tmux/capture`, `${publicBase}/tmux/capture`]);
    expect(result.status).toBe("disabled");
  });

  it("aggregates every base URL's failure with a ' | ' separator when all endpoints fail", async () => {
    const error = (await requestTmuxCapture({
      serverBaseUrl: [lanBase, publicBase],
      request: { id: "tmux_capture_all_fail", sessionId: "session_desktop_001", role: "status" },
      fetchImpl: async () => jsonResponse({ error: "boom" }, 500),
    }).catch((caught) => caught)) as Error;

    expect(error.message).toContain(`${lanBase}:`);
    expect(error.message).toContain(`${publicBase}:`);
    expect(error.message).toContain(" | ");
    expect(error.message).toContain("failed: 500");
  });

  it("truncates the response body to 180 chars in the non-ok error message", async () => {
    // body far longer than 180 chars; the marker sits well past the cut point
    const longBody = `${"T".repeat(250)}AFTER_CUT_MARKER`;
    const error = (await requestTmuxCapture({
      serverBaseUrl: [lanBase],
      request: { id: "tmux_capture_long_err", sessionId: "session_desktop_001", role: "status" },
      fetchImpl: async () => jsonResponse(longBody, 500),
    }).catch((caught) => caught)) as Error;

    expect(error.message).toContain("failed: 500");
    // a long run of the leading body survives, but the post-180 marker is dropped
    expect(error.message).toContain("T".repeat(170));
    expect(error.message).not.toContain("AFTER_CUT_MARKER");
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
