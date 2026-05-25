import type { IncomingMessage } from "node:http";
import type { ApprovalDecisionRequest, ApprovalState } from "@ai-orchestrator/protocol";
import { approvalDecisionRequestSchema } from "@ai-orchestrator/protocol";

export type ApprovalRouteDecision = Extract<ApprovalState, "approved" | "rejected">;

export type ApprovalRouteDecisionResult = {
  statusCode: number;
  payload: unknown;
};

export type ApprovalRouteDependencies<TStorage> = {
  eventStorage: TStorage;
  request: IncomingMessage;
  pathname: string;
  method?: string;
  readJsonBody: (request: IncomingMessage) => Promise<unknown>;
  isRequestBodyTooLargeError: (error: unknown) => error is { limit: number };
  listApprovals: (storage: TStorage) => Promise<unknown>;
  decideApproval: (
    request: ApprovalDecisionRequest,
    decision: ApprovalRouteDecision,
    storage: TStorage,
  ) => Promise<ApprovalRouteDecisionResult>;
  respondJson: (statusCode: number, payload: unknown) => void;
};

export async function handleApprovalRoute<TStorage>({
  eventStorage,
  request,
  pathname,
  method,
  readJsonBody,
  isRequestBodyTooLargeError,
  listApprovals,
  decideApproval,
  respondJson,
}: ApprovalRouteDependencies<TStorage>): Promise<boolean> {
  if ((pathname === "/approvals" || pathname === "/approvals/list") && method === "GET") {
    respondJson(200, await listApprovals(eventStorage));
    return true;
  }

  if ((pathname === "/approvals/grant" || pathname === "/approvals/reject") && method === "POST") {
    let payload: ApprovalDecisionRequest;
    try {
      payload = approvalDecisionRequestSchema.parse(await readJsonBody(request)) as ApprovalDecisionRequest;
    } catch (error) {
      if (isRequestBodyTooLargeError(error)) {
        respondJson(413, { error: "payload_too_large", limit: error.limit });
        return true;
      }
      respondJson(400, {
        error: "invalid_approval_decision_payload",
        message: error instanceof Error ? error.message : String(error),
      });
      return true;
    }

    const decision = pathname === "/approvals/grant" ? "approved" : "rejected";
    const result = await decideApproval(payload, decision, eventStorage);
    respondJson(result.statusCode, result.payload);
    return true;
  }

  return false;
}
