import { useCallback, useMemo, useState } from "react";
import type { ActualVerification, PathPolicyInput } from "../lib/runnerPatchSafety";
import type { CodingRunResult } from "../lib/codingRunner";
import type { RunnerPatchHandoff } from "../lib/runnerPatchHandoff";
import {
  approveRunnerPatch,
  EMPTY_RUNNER_PATCH_APPROVAL_QUEUE,
  enqueueRunnerPatchApproval,
  rejectRunnerPatch,
  type RunnerPatchApprovalItem,
  type RunnerPatchApprovalQueue,
} from "../lib/runnerPatchApprovalQueue";

/**
 * H8e — React hook around the pure runner-patch approval queue.
 *
 * 명시적 비범위:
 *  - apply 함수 노출 0
 *  - server 호출 0 (이 큐는 client-side; DGX approval queue와 분리)
 *  - patch 본문 mutate 0
 *  - GitHub write 0
 */

export type RunnerPatchApprovalController = {
  items: ReadonlyArray<RunnerPatchApprovalItem>;
  /**
   * H8c handoff + 검증 입력을 받아 큐에 등록.
   *  - safety report는 hook 내부에서 만들어 annotate
   *  - blocked이면 item.state="blocked" (큐에는 들어가지만 승인 불가)
   */
  enqueue: (input: {
    handoff: RunnerPatchHandoff;
    result: Pick<CodingRunResult, "testResult">;
    pathPolicy?: PathPolicyInput;
    actualVerification?: ActualVerification;
  }) => void;
  approve: (itemId: string) => boolean;
  reject: (itemId: string, reason: string) => boolean;
};

export type UseRunnerPatchApprovalQueueControllerInput = {
  /** 기본은 new Date().toISOString(). 테스트에서 결정론적으로 주입 가능. */
  now?: () => string;
  initialQueue?: RunnerPatchApprovalQueue;
};

export function useRunnerPatchApprovalQueueController(
  input: UseRunnerPatchApprovalQueueControllerInput = {},
): RunnerPatchApprovalController {
  const now = input.now ?? (() => new Date().toISOString());
  const [queue, setQueue] = useState<RunnerPatchApprovalQueue>(
    () => input.initialQueue ?? EMPTY_RUNNER_PATCH_APPROVAL_QUEUE,
  );

  const enqueue = useCallback<RunnerPatchApprovalController["enqueue"]>(
    (enqInput) => {
      setQueue((prev) =>
        enqueueRunnerPatchApproval(prev, {
          handoff: enqInput.handoff,
          result: enqInput.result,
          pathPolicy: enqInput.pathPolicy,
          actualVerification: enqInput.actualVerification,
          now,
        }),
      );
    },
    [now],
  );

  const approve = useCallback<RunnerPatchApprovalController["approve"]>(
    (itemId) => {
      const res = approveRunnerPatch(queue, itemId, now);
      if (res.ok) {
        setQueue(res.queue);
        return true;
      }
      return false;
    },
    [queue, now],
  );

  const reject = useCallback<RunnerPatchApprovalController["reject"]>(
    (itemId, reason) => {
      const res = rejectRunnerPatch(queue, itemId, reason, now);
      if (res.ok) {
        setQueue(res.queue);
        return true;
      }
      return false;
    },
    [queue, now],
  );

  return useMemo<RunnerPatchApprovalController>(
    () => ({ items: queue.items, enqueue, approve, reject }),
    [queue.items, enqueue, approve, reject],
  );
}
