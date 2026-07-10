import type { TerminalHostKind, TmuxPaneRole } from "@ai-orchestrator/protocol";
import {
  requestTmuxCapture,
  requestTmuxDispatch,
  type DesktopTmuxCaptureResponse,
  type DesktopTmuxDispatchResponse,
} from "../runtime/stage33TmuxServer";
import { replayDgxApproval, fetchDgxApprovalQueue, type DesktopApprovalReplayResponse } from "../runtime/stage34ApprovalServer";
import type { ClosedLoopEffects } from "./closedLoopController";

/**
 * Real-runtime adapter (mode A — human-in-the-loop).
 *
 * Binds the closed-loop controller's injected effects to the existing DGX
 * client functions. The server gates terminal_run as approval_required by
 * default, so each loop step is:
 *
 *   dispatch(required)  ->  wait for a human to grant in the Ops queue
 *                       ->  replay (which is what actually executes)
 *
 * The loop never grants its own approval and never bypasses the gate. A
 * separate "mode B" (auto-approve a safe command allowlist) can later supply a
 * different `awaitApprovalDecision` strategy behind an explicit opt-in without
 * touching the controller or this adapter's shape.
 */

/** timeout = 아무도 결정하지 않은 채 폴링 창이 끝남 — 사람의 거부(rejected)와 구분해 표기 */
export type ApprovalDecisionOutcome = "approved" | "rejected" | "timeout";

export type ClosedLoopRuntimeDeps = {
  sessionId: string;
  role: TmuxPaneRole;
  paneId?: string;
  host?: TerminalHostKind;
  terminalSessionId?: string;
  tmuxSessionName?: string;
  serverBaseUrl?: string | string[];
  fetchImpl?: typeof fetch;
  /**
   * Resolves the queued approval for a dispatched command. Mode A polls the
   * Ops queue for a human grant; mode B may auto-approve safe commands. The
   * dispatched command is passed as context so a policy can decide on it.
   */
  awaitApprovalDecision: (
    sourceItemId: string,
    context: { command: string; stepIndex?: number },
  ) => Promise<ApprovalDecisionOutcome>;
  /** deterministic id per dispatched step; receives the step index (-1 for captures) */
  newId: (stepIndex: number) => string;
  now?: () => string;
  /** notified when the loop escalates (blocked / stuck / iteration cap) */
  escalateNotify?: (reason: string) => Promise<void> | void;
  /** observer invoked once per loop iteration (for live timelines/telemetry) */
  onStep?: ClosedLoopEffects["onStep"];
  // injected clients (default to the real DGX clients)
  dispatchClient?: typeof requestTmuxDispatch;
  captureClient?: typeof requestTmuxCapture;
  replayClient?: typeof replayDgxApproval;
};

export function createClosedLoopEffects(deps: ClosedLoopRuntimeDeps): ClosedLoopEffects {
  const now = deps.now ?? (() => new Date().toISOString());
  const dispatchClient = deps.dispatchClient ?? requestTmuxDispatch;
  const captureClient = deps.captureClient ?? requestTmuxCapture;
  const replayClient = deps.replayClient ?? replayDgxApproval;

  const common = {
    sessionId: deps.sessionId,
    role: deps.role,
    paneId: deps.paneId,
    host: deps.host,
    terminalSessionId: deps.terminalSessionId,
    tmuxSessionName: deps.tmuxSessionName,
  };

  return {
    dispatch: async (command, { stepIndex }) => {
      const id = deps.newId(stepIndex);
      const response: DesktopTmuxDispatchResponse = await dispatchClient({
        request: {
          ...common,
          id,
          commandPreview: command,
          approvalState: "required",
          dispatchMode: "execute_if_approved",
          createdAt: now(),
        },
        serverBaseUrl: deps.serverBaseUrl,
        fetchImpl: deps.fetchImpl,
      });

      // If the gate let it through already (e.g. a future mode-B policy), we're done.
      if (response.dispatch.status === "sent" || response.dispatch.status === "dry_run") {
        return;
      }
      if (response.dispatch.status === "blocked" || response.dispatch.status === "failed") {
        throw new Error(`dispatch ${response.dispatch.status}: ${response.dispatch.reason}`);
      }

      // pending_approval / recorded: a human must approve in the Ops queue first.
      const sourceItemId = response.approval?.sourceItemId ?? id;
      const decision = await deps.awaitApprovalDecision(sourceItemId, { command, stepIndex });
      if (decision !== "approved") {
        throw new Error(
          decision === "timeout"
            ? `approval timeout for verification step ${stepIndex} — 승인 큐에서 제한 시간 내 결정이 없었습니다`
            : `approval ${decision} for verification step ${stepIndex}`,
        );
      }

      const replay: DesktopApprovalReplayResponse = await replayClient({
        request: { sourceItemId, actor: "user", reason: "closed-loop verification step" },
        serverBaseUrl: deps.serverBaseUrl,
        fetchImpl: deps.fetchImpl,
      });
      if (replay.status !== "replayed") {
        throw new Error(`replay not_replayed: ${replay.reason}`);
      }
    },

    capture: async () => {
      const response: DesktopTmuxCaptureResponse = await captureClient({
        request: { ...common, id: deps.newId(-1), createdAt: now() },
        serverBaseUrl: deps.serverBaseUrl,
        fetchImpl: deps.fetchImpl,
      });
      return response.payload?.outputPreview ?? "";
    },

    escalate: async (reason) => {
      if (deps.escalateNotify) {
        await deps.escalateNotify(reason);
      }
    },

    onStep: deps.onStep,
  };
}

/**
 * Default mode-A approval strategy: poll the Ops approval list until the human
 * grants or rejects the queued item (or the wait times out). `sleep` and `now`
 * are injected so this is deterministic in tests.
 */
export async function pollForApprovalDecision(input: {
  sourceItemId: string;
  serverBaseUrl?: string | string[];
  fetchImpl?: typeof fetch;
  fetchQueue?: typeof fetchDgxApprovalQueue;
  intervalMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  nowMs?: () => number;
  /** cooperative cancellation — an abort resolves the poll immediately as "timeout" */
  signal?: AbortSignal;
}): Promise<ApprovalDecisionOutcome> {
  const fetchQueue = input.fetchQueue ?? fetchDgxApprovalQueue;
  const intervalMs = input.intervalMs ?? 2_000;
  const timeoutMs = input.timeoutMs ?? 120_000;
  const sleep = input.sleep ?? ((ms: number) => new Promise<void>((resolve) => globalThis.setTimeout(resolve, ms)));
  const nowMs = input.nowMs ?? (() => Date.now());

  const startedAt = nowMs();
  for (;;) {
    if (input.signal?.aborted) {
      return "timeout";
    }
    const list = await fetchQueue({ serverBaseUrl: input.serverBaseUrl, fetchImpl: input.fetchImpl });
    const approval = list.approvals.find((candidate) => candidate.sourceItemId === input.sourceItemId);
    if (approval?.state === "approved") {
      return "approved";
    }
    if (approval?.state === "rejected" || approval?.state === "expired") {
      return "rejected";
    }
    if (nowMs() - startedAt >= timeoutMs) {
      return "timeout";
    }
    await sleepWithAbort(intervalMs, sleep, input.signal);
  }
}

/**
 * Sleep that wakes early when the signal aborts. Respects an injected `sleep`
 * (tests) and removes its abort listener when the sleep wins, so a long-lived
 * signal does not accumulate listeners across poll iterations.
 */
async function sleepWithAbort(
  ms: number,
  sleep: (ms: number) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  if (!signal) {
    await sleep(ms);
    return;
  }
  if (signal.aborted) {
    return;
  }
  await new Promise<void>((resolve) => {
    const onAbort = () => resolve();
    signal.addEventListener("abort", onAbort, { once: true });
    void sleep(ms).then(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    });
  });
}
