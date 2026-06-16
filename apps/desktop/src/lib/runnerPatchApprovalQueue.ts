import type { CodingRunResult } from "./codingRunner";
import type { RunnerPatchHandoff } from "./runnerPatchHandoff";
import {
  annotateHandoffWithSafety,
  buildRunnerPatchSafetyReport,
  type ActualVerification,
  type PathPolicyInput,
  type SafetyAnnotatedHandoff,
} from "./runnerPatchSafety";

/**
 * H8e — Runner patch approval queue (client-side).
 *
 * `RunnerPatchHandoff`를 사람이 결재할 큐에 올리는 *순수* 모듈. 큐 항목은 patch
 * 본문을 절대 mutate 하지 않고, `SafetyAnnotatedHandoff`를 그대로 reference로 들고
 * 있다. 승인 액션은 **상태만 바꾼다** — apply / commit / PR / GitHub write 0.
 *
 * 안전 라인:
 *   - safety.status === "blocked"  → 항목 상태 `blocked`. 승인 버튼 사용 불가.
 *   - safety.status === "warning"  → 항목 상태 `pending`. 승인 가능, warning 표시.
 *   - safety.status === "pass"     → 항목 상태 `pending`. 승인 가능.
 *   - approve() → `approved_for_apply`. 다음 단계(H8f apply preview) 후보.
 *     이 모듈은 apply 함수를 노출하지 않는다.
 *   - reject() → `rejected` (이유 보존).
 *   - patch 본문 mutate 0 — 큐가 들고 있는 SafetyAnnotatedHandoff는 immutable.
 *   - requiresApproval은 모든 경로에서 true로 유지.
 *
 * 결정론: id는 호출자가 주는 `now()`로만 만들고, Date.now() 같은 부수효과는 안 쓴다.
 * 그래야 헤드리스 테스트가 결정론적.
 */

export type RunnerPatchApprovalState =
  | "pending" // safety pass/warning. 승인 가능
  | "blocked" // safety blocked. 승인 불가
  | "approved_for_apply" // 승인됨 — 다음 단계 후보. 아직 apply 안 됨
  | "rejected"; // 거절됨

export type RunnerPatchApprovalItem = {
  id: string;
  /** 항목 생성 시각 (호출자 now()) */
  createdAt: string;
  /** 마지막 상태 변경 시각 */
  updatedAt: string;
  state: RunnerPatchApprovalState;
  /**
   * patch 본문 immutable reference. safety annotation 포함.
   * apply 단계가 이 reference를 읽고 dry-run을 만들 수 있도록 그대로 둔다.
   */
  handoff: SafetyAnnotatedHandoff;
  /** 결재자가 적은 거절 사유 (state=rejected 일 때만 의미) */
  rejectionReason?: string;
  /** 결재 시각 (approved_for_apply / rejected 일 때만) */
  resolvedAt?: string;
};

export type RunnerPatchApprovalQueue = {
  items: ReadonlyArray<RunnerPatchApprovalItem>;
};

export const EMPTY_RUNNER_PATCH_APPROVAL_QUEUE: RunnerPatchApprovalQueue = { items: [] };

// ── enqueue ──

export type EnqueueRunnerPatchInput = {
  /** 원본 H8c handoff (safety report는 여기서 만든다) */
  handoff: RunnerPatchHandoff;
  /** H8c가 환원한 CodingRunResult — verification claimed vs actual 분리용 */
  result: Pick<CodingRunResult, "testResult">;
  /** 경로 정책 (있을 때만) */
  pathPolicy?: PathPolicyInput;
  /** 별도 verifier가 본 실제 테스트 결과 (있을 때만) */
  actualVerification?: ActualVerification;
  /** 결정론적 id/시각 */
  now: () => string;
};

/**
 * pure — 큐에 새 항목 등록.
 *
 *   - safety report를 만들어 handoff를 annotate한다.
 *   - safety blocked면 item.state = "blocked" (승인 불가). 큐에는 들어가지만
 *     reviewer가 무엇이 막혔는지 볼 수 있다 (가짜 성공 표시 0).
 *   - 같은 handoff.id가 이미 있으면 그 항목을 그대로 두고 새로 추가하지 않는다
 *     (중복 enqueue 방지).
 */
export function enqueueRunnerPatchApproval(
  queue: RunnerPatchApprovalQueue,
  input: EnqueueRunnerPatchInput,
): RunnerPatchApprovalQueue {
  const existing = queue.items.find((it) => it.handoff.id === input.handoff.id);
  if (existing) return queue;

  const safetyReport = buildRunnerPatchSafetyReport({
    handoff: input.handoff,
    result: input.result,
    pathPolicy: input.pathPolicy,
    actualVerification: input.actualVerification,
  });
  const annotated = annotateHandoffWithSafety(input.handoff, safetyReport);

  const state: RunnerPatchApprovalState = annotated.safety.status === "blocked" ? "blocked" : "pending";

  const now = input.now();
  const item: RunnerPatchApprovalItem = {
    id: `approval_${annotated.id}`,
    createdAt: now,
    updatedAt: now,
    state,
    handoff: annotated,
  };

  return { items: [...queue.items, item] };
}

// ── approve / reject ──

export type ApproveResult =
  | { ok: true; queue: RunnerPatchApprovalQueue }
  | { ok: false; reason: "not_found" | "blocked_by_safety" | "already_resolved" };

/**
 * Mark an item as approved_for_apply. **Does not call any apply function.**
 *
 *   - state === "blocked"     → 거부. safety가 차단한 항목은 절대 승인 불가.
 *   - state === "approved..." | "rejected" → 이미 결재된 항목은 재승인 안 됨.
 *   - state === "pending"     → "approved_for_apply"로 전이.
 */
export function approveRunnerPatch(
  queue: RunnerPatchApprovalQueue,
  itemId: string,
  now: () => string,
): ApproveResult {
  const idx = queue.items.findIndex((it) => it.id === itemId);
  if (idx < 0) return { ok: false, reason: "not_found" };
  const item = queue.items[idx]!;
  if (item.state === "blocked") return { ok: false, reason: "blocked_by_safety" };
  if (item.state !== "pending") return { ok: false, reason: "already_resolved" };

  const ts = now();
  const next: RunnerPatchApprovalItem = {
    ...item,
    state: "approved_for_apply",
    updatedAt: ts,
    resolvedAt: ts,
  };
  const items = queue.items.slice();
  items[idx] = next;
  return { ok: true, queue: { items } };
}

export type RejectResult =
  | { ok: true; queue: RunnerPatchApprovalQueue }
  | { ok: false; reason: "not_found" | "already_resolved" };

export function rejectRunnerPatch(
  queue: RunnerPatchApprovalQueue,
  itemId: string,
  rejectionReason: string,
  now: () => string,
): RejectResult {
  const idx = queue.items.findIndex((it) => it.id === itemId);
  if (idx < 0) return { ok: false, reason: "not_found" };
  const item = queue.items[idx]!;
  if (item.state === "approved_for_apply" || item.state === "rejected") {
    return { ok: false, reason: "already_resolved" };
  }
  // blocked 항목도 reject할 수 있다 (해소 의도 표현). 단, approve는 안 된다.

  const ts = now();
  const next: RunnerPatchApprovalItem = {
    ...item,
    state: "rejected",
    updatedAt: ts,
    resolvedAt: ts,
    rejectionReason: rejectionReason.trim() || undefined,
  };
  const items = queue.items.slice();
  items[idx] = next;
  return { ok: true, queue: { items } };
}

// ── selectors (UI 라벨) ──

export const APPROVAL_STATE_LABEL: Record<RunnerPatchApprovalState, string> = {
  pending: "결재 대기",
  blocked: "안전 차단",
  approved_for_apply: "승인됨 — 적용 단계 대기",
  rejected: "거절됨",
};

export function isApprovableState(state: RunnerPatchApprovalState): boolean {
  return state === "pending";
}

export function isPendingState(state: RunnerPatchApprovalState): boolean {
  return state === "pending" || state === "blocked";
}
