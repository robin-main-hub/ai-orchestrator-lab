import type {
  ApprovalRequest,
  PermissionDecision,
  PermissionLevel,
  TerminalCommandIntent,
  TerminalHostKind,
  TerminalTimelineBlock,
  TmuxPaneRole,
} from "@ai-orchestrator/protocol";
import { resolveDgxServerBaseUrls } from "./stage30DgxEndpoints";
import { createDgxOrchestratorJsonHeaders } from "./stage31DgxAuth";

export type DesktopTmuxDispatchMode = "record_only" | "execute_if_approved";

export type DesktopTmuxDispatchRequest = {
  id: string;
  sessionId: string;
  terminalSessionId?: string;
  role: TmuxPaneRole;
  host?: TerminalHostKind;
  paneId?: string;
  commandPreview: string;
  approvalState?: "not_required" | "required" | "approved" | "rejected" | "expired";
  dispatchMode?: DesktopTmuxDispatchMode;
  tmuxSessionName?: string;
  createdAt?: string;
};

export type DesktopTmuxDispatchResponse = {
  intent: TerminalCommandIntent;
  permission: {
    decision: PermissionDecision;
    requestedLevels: PermissionLevel[];
    reason: string;
  };
  approval?: ApprovalRequest;
  dispatch: {
    attempted: boolean;
    status: "recorded" | "pending_approval" | "blocked" | "sent" | "failed" | "dry_run";
    reason: string;
  };
  timelineBlocks?: TerminalTimelineBlock[];
};

export type DesktopTmuxPreflightResponse = {
  intent: TerminalCommandIntent;
  permission: {
    decision: PermissionDecision;
    requestedLevels: PermissionLevel[];
    reason: string;
  };
  approval?: ApprovalRequest;
  timelineBlocks?: TerminalTimelineBlock[];
  audit: {
    redactionApplied: boolean;
    wouldRecordEvents: string[];
    wouldQueueApproval: boolean;
    wouldAttemptSendKeys: boolean;
    dryRunEnabled: boolean;
    sendKeysEnabled: boolean;
    replayEndpoint?: string;
    checks: Array<{
      id: string;
      status: "pass" | "warn" | "block";
      message: string;
    }>;
  };
};

export type DesktopTmuxCaptureRequest = {
  id: string;
  sessionId: string;
  terminalSessionId?: string;
  role: TmuxPaneRole;
  host?: TerminalHostKind;
  paneId?: string;
  lines?: number;
  tmuxSessionName?: string;
  createdAt?: string;
};

export type DesktopTmuxCaptureResponse = {
  status: "disabled" | "captured" | "failed";
  reason: string;
  payload?: {
    terminalSessionId: string;
    paneId: string;
    role: TmuxPaneRole;
    outputPreview: string;
    lineCount: number;
    redactionApplied: boolean;
    capturedAt: string;
  };
  timelineBlocks?: TerminalTimelineBlock[];
};

type TmuxServerRequestInput<TRequest> = {
  request: TRequest;
  serverBaseUrl?: string | string[];
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export async function requestTmuxDispatch({
  request,
  serverBaseUrl,
  fetchImpl = fetch,
  timeoutMs = 5_000,
}: TmuxServerRequestInput<DesktopTmuxDispatchRequest>): Promise<DesktopTmuxDispatchResponse> {
  return postTmuxServerJson<DesktopTmuxDispatchResponse>({
    path: "/tmux/dispatch",
    request,
    serverBaseUrl,
    fetchImpl,
    timeoutMs,
  });
}

export async function requestTmuxPreflight({
  request,
  serverBaseUrl,
  fetchImpl = fetch,
  timeoutMs = 5_000,
}: TmuxServerRequestInput<DesktopTmuxDispatchRequest>): Promise<DesktopTmuxPreflightResponse> {
  return postTmuxServerJson<DesktopTmuxPreflightResponse>({
    path: "/tmux/preflight",
    request,
    serverBaseUrl,
    fetchImpl,
    timeoutMs,
  });
}

export async function requestTmuxCapture({
  request,
  serverBaseUrl,
  fetchImpl = fetch,
  timeoutMs = 5_000,
}: TmuxServerRequestInput<DesktopTmuxCaptureRequest>): Promise<DesktopTmuxCaptureResponse> {
  return postTmuxServerJson<DesktopTmuxCaptureResponse>({
    path: "/tmux/capture",
    request,
    serverBaseUrl,
    fetchImpl,
    timeoutMs,
  });
}

async function postTmuxServerJson<TResponse>({
  path,
  request,
  serverBaseUrl,
  fetchImpl,
  timeoutMs,
}: {
  path: string;
  request: unknown;
  serverBaseUrl?: string | string[];
  fetchImpl: typeof fetch;
  timeoutMs: number;
}): Promise<TResponse> {
  const errors: string[] = [];

  for (const baseUrl of resolveDgxServerBaseUrls(serverBaseUrl)) {
    const endpoint = `${baseUrl}${path}`;
    const body = JSON.stringify(request);
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetchImpl(endpoint, {
        body,
        headers: await createDgxOrchestratorJsonHeaders("POST", path, endpoint, { body }),
        method: "POST",
        signal: controller.signal,
      });
      const rawText = await response.text();
      if (!response.ok && response.status !== 403) {
        throw new Error(`${endpoint} failed: ${response.status} ${rawText.slice(0, 180)}`);
      }

      return JSON.parse(rawText) as TResponse;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${baseUrl}: ${message}`);
    } finally {
      globalThis.clearTimeout(timeoutId);
    }
  }

  throw new Error(errors.join(" | ") || `DGX-02 tmux endpoint unavailable: ${path}`);
}
