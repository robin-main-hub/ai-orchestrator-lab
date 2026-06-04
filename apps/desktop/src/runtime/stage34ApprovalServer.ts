import type {
  ApprovalDecisionRequest,
  ApprovalQueueItem,
  ApprovalRequest,
  ApprovalState,
  EventEnvelope,
} from "@ai-orchestrator/protocol";
import { resolveDgxServerBaseUrls } from "./stage30DgxEndpoints";
import { createDgxOrchestratorJsonHeaders } from "./stage31DgxAuth";

export type DesktopApprovalListResponse = {
  approvals: ApprovalRequest[];
  queue: ApprovalQueueItem[];
};

export type DesktopApprovalDecisionResponse =
  | {
      approval: ApprovalRequest;
      event: EventEnvelope;
      status: Extract<ApprovalState, "approved" | "rejected">;
    }
  | {
      error: string;
      approval?: ApprovalRequest;
    };

export type DesktopApprovalReplayResponse =
  | {
      status: "replayed";
      approval: ApprovalRequest;
      replay: ApprovalRequest["replay"];
      result: unknown;
      eventSync?: unknown;
    }
  | {
      status: "not_replayed";
      reason: string;
      approval?: ApprovalRequest;
    };

export type DesktopApprovalDecisionInput = Pick<
  ApprovalDecisionRequest,
  "approvalId" | "sourceItemId" | "actor" | "reason" | "decidedAt"
>;

type ApprovalServerRequestInput = {
  serverBaseUrl?: string | string[];
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

type ApprovalServerPostInput<TRequest> = ApprovalServerRequestInput & {
  request: TRequest;
};

export async function fetchDgxApprovalQueue({
  serverBaseUrl,
  fetchImpl = fetch,
  timeoutMs = 3_000,
}: ApprovalServerRequestInput = {}): Promise<DesktopApprovalListResponse> {
  return requestApprovalServerJson<DesktopApprovalListResponse>({
    method: "GET",
    path: "/approvals/list",
    serverBaseUrl,
    fetchImpl,
    timeoutMs,
  });
}

export async function grantDgxApproval({
  request,
  serverBaseUrl,
  fetchImpl = fetch,
  timeoutMs = 3_000,
}: ApprovalServerPostInput<DesktopApprovalDecisionInput>): Promise<DesktopApprovalDecisionResponse> {
  return requestApprovalServerJson<DesktopApprovalDecisionResponse>({
    body: request,
    method: "POST",
    path: "/approvals/grant",
    serverBaseUrl,
    fetchImpl,
    timeoutMs,
  });
}

export async function rejectDgxApproval({
  request,
  serverBaseUrl,
  fetchImpl = fetch,
  timeoutMs = 3_000,
}: ApprovalServerPostInput<DesktopApprovalDecisionInput>): Promise<DesktopApprovalDecisionResponse> {
  return requestApprovalServerJson<DesktopApprovalDecisionResponse>({
    body: request,
    method: "POST",
    path: "/approvals/reject",
    serverBaseUrl,
    fetchImpl,
    timeoutMs,
  });
}

export async function replayDgxApproval({
  request,
  serverBaseUrl,
  fetchImpl = fetch,
  timeoutMs = 8_000,
}: ApprovalServerPostInput<DesktopApprovalDecisionInput>): Promise<DesktopApprovalReplayResponse> {
  return requestApprovalServerJson<DesktopApprovalReplayResponse>({
    body: request,
    method: "POST",
    path: "/approvals/replay",
    serverBaseUrl,
    fetchImpl,
    timeoutMs,
  });
}

async function requestApprovalServerJson<TResponse>({
  body,
  fetchImpl,
  method,
  path,
  serverBaseUrl,
  timeoutMs,
}: {
  body?: unknown;
  fetchImpl: typeof fetch;
  method: "GET" | "POST";
  path: string;
  serverBaseUrl?: string | string[];
  timeoutMs: number;
}): Promise<TResponse> {
  const errors: string[] = [];

  for (const baseUrl of resolveDgxServerBaseUrls(serverBaseUrl)) {
    const endpoint = `${baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetchImpl(endpoint, {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: await createDgxOrchestratorJsonHeaders(method, path, endpoint),
        method,
        signal: controller.signal,
      });
      const rawText = await response.text();
      if (!response.ok) {
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

  throw new Error(errors.join(" | ") || `DGX-02 approval endpoint unavailable: ${path}`);
}
