import { useCallback, useMemo, useSyncExternalStore } from "react";
import { autonomyRunStore, type AutonomyRunStore } from "../lib/autonomyRunStore";
import type { RunningWorkItem } from "./RunningWorkCard";

/**
 * 홈 "현재 작업 · 중지"의 autonomy 측 공급자. RMAS는 서버 실행이라 폴링하지만
 * autonomy 실행은 이 브라우저 안에서 돌므로 autonomyRunStore를 구독해 즉시
 * 반영한다. 중지는 스토어의 abort 핸들(AbortController) 호출로 위임.
 */

export type UseRunningAutonomyRunOptions = {
  /** 테스트 심 — 스토어 주입 */
  store?: AutonomyRunStore;
};

export type UseRunningAutonomyRunResult = {
  items: RunningWorkItem[];
  stoppingIds: string[];
  stop: (id: string) => void;
  refresh: () => void;
};

export function useRunningAutonomyRun(
  options: UseRunningAutonomyRunOptions = {},
): UseRunningAutonomyRunResult {
  const store = options.store ?? autonomyRunStore;
  const live = useSyncExternalStore(store.subscribe, store.get, store.get);
  const items = useMemo<RunningWorkItem[]>(() => {
    if (!live.running) return [];
    return [
      {
        id: live.runId ?? "autonomy",
        label: live.goal ?? "자율 실행",
        status: "running",
        kind: "autonomy" as const,
        goal: live.goal ?? undefined,
        startedAt: live.startedAt ?? undefined,
        iterations: live.steps.length,
      },
    ];
  }, [live]);
  const stoppingIds = useMemo(
    () => (live.running && live.cancelling ? [live.runId ?? "autonomy"] : []),
    [live],
  );
  const stop = useCallback(() => {
    store.get().abort?.();
  }, [store]);
  const refresh = useCallback(() => {
    // 폴링이 없다 — 스토어 구독이 곧 실시간. RMAS 훅과의 모양 맞춤용 no-op.
  }, []);
  return { items, stoppingIds, stop, refresh };
}
