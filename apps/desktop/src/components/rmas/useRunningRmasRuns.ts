import { useCallback, useEffect, useRef, useState } from "react";
import { listRmasRuns, stopRmasRun } from "../../lib/rmasClient";
import type { RunningWorkItem } from "../RunningWorkCard";
import { isRunningStatus } from "./rmasViewModel";

/**
 * 홈의 "현재 작업 · 중지" 컨트롤을 구동하는 훅. 서버의 `/rmas/runs`를 주기적으로
 * 폴링해 running/queued 실행만 골라 RunningWorkItem으로 매핑하고, 항목별 중지를
 * `POST /rmas/runs/:id/stop`으로 위임한다. (autonomy 실행은 stop 핸들이 없어 미포함)
 *
 * 서버가 없거나 실패하면 조용히 빈 목록을 유지한다 — 홈은 "현재 작업 없음"으로
 * 떨어질 뿐, 사용자가 손댈 오류가 아니다.
 */

const POLL_INTERVAL_MS = 5_000;

export type UseRunningRmasRunsOptions = {
  serverBaseUrl?: string;
  /** 테스트 심 — fetch 주입 */
  fetchImpl?: typeof fetch;
  pollIntervalMs?: number;
  /** 폴링 비활성화 (테스트/비가시 상태) */
  enabled?: boolean;
};

export type UseRunningRmasRunsResult = {
  items: RunningWorkItem[];
  stoppingIds: string[];
  stop: (id: string) => void;
  refresh: () => void;
};

export function useRunningRmasRuns(options: UseRunningRmasRunsOptions = {}): UseRunningRmasRunsResult {
  const { serverBaseUrl, fetchImpl, pollIntervalMs = POLL_INTERVAL_MS, enabled = true } = options;

  const [items, setItems] = useState<RunningWorkItem[]>([]);
  const [stoppingIds, setStoppingIds] = useState<string[]>([]);
  const mountedRef = useRef(true);

  const clientOptionsRef = useRef({ serverBaseUrl, fetchImpl });
  clientOptionsRef.current = { serverBaseUrl, fetchImpl };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    listRmasRuns(clientOptionsRef.current)
      .then((summaries) => {
        if (!mountedRef.current) return;
        setItems(
          summaries
            .filter((summary) => isRunningStatus(summary.status))
            .map((summary) => ({
              id: summary.runId,
              label: summary.goalPreview || summary.runId,
              status: summary.status,
              kind: "rmas" as const,
              goal: summary.goalPreview || summary.runId,
              startedAt: summary.startedAt,
              tokensTotal: summary.tokens.total,
              iterations: summary.iterations,
            })),
        );
      })
      .catch(() => {
        // 서버 부재/일시 실패 — 마지막 상태 유지, 다음 tick에 재시도
      });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    refresh();
    const timer = setInterval(refresh, pollIntervalMs);
    return () => clearInterval(timer);
  }, [enabled, pollIntervalMs, refresh]);

  const stop = useCallback(
    (id: string) => {
      setStoppingIds((current) => (current.includes(id) ? current : [...current, id]));
      stopRmasRun(id, clientOptionsRef.current)
        .catch(() => {
          // 중지 요청 실패 — 다음 폴링이 실제 상태로 정정한다
        })
        .finally(() => {
          if (!mountedRef.current) return;
          setStoppingIds((current) => current.filter((entry) => entry !== id));
          refresh();
        });
    },
    [refresh],
  );

  return { items, stoppingIds, stop, refresh };
}
