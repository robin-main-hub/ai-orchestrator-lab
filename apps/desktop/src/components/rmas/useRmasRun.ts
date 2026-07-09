import { useCallback, useEffect, useRef, useState } from "react";
import type { RmasRunConfig, RmasRunRecord, RmasTraceEvent } from "@ai-orchestrator/protocol";
import {
  getRmasRun,
  listRmasRuns,
  RmasClientError,
  startRmasRun,
  stopRmasRun,
} from "../../lib/rmasClient";
import { openRmasTraceStream } from "../../runtime/stage48RmasStream";
import {
  elapsedMsFor,
  foldTraceSnapshot,
  isRunningStatus,
  mergeTraceEvent,
  pickReattachRun,
} from "./rmasViewModel";

/**
 * Hook that owns one RMAS run's live view. It combines the two server channels
 * the contract splits work across:
 *   - trace feed  ← SSE (`rmas.trace.snapshot` + `rmas.trace`)
 *   - status dots + token counters ← polled `GET /rmas/runs/:id` (they are NOT
 *     on the trace wire), refreshed every few seconds while running.
 *
 * On mount it lists runs and auto-reattaches to the newest running one — the
 * "자고 와도 이어본다" (reattach after the app was closed) requirement: the
 * snapshot replays full history from persisted events and the SSE resumes live.
 */

const POLL_INTERVAL_MS = 4_000;

export type UseRmasRunOptions = {
  serverBaseUrl?: string;
  /** test seam — inject fakes */
  fetchImpl?: typeof fetch;
  /** disable the mount-time reattach (tests / when not visible) */
  autoReattach?: boolean;
};

export type UseRmasRunResult = {
  runId: string | null;
  record: RmasRunRecord | null;
  trace: RmasTraceEvent[];
  elapsedMs: number;
  running: boolean;
  busy: boolean;
  reattaching: boolean;
  error: string | null;
  atCapacity: boolean;
  start: (config: RmasRunConfig) => Promise<void>;
  stop: () => Promise<void>;
  clearError: () => void;
};

export function useRmasRun(options: UseRmasRunOptions = {}): UseRmasRunResult {
  const { serverBaseUrl, fetchImpl, autoReattach = true } = options;

  const [runId, setRunId] = useState<string | null>(null);
  const [record, setRecord] = useState<RmasRunRecord | null>(null);
  const [trace, setTrace] = useState<RmasTraceEvent[]>([]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [busy, setBusy] = useState(false);
  const [reattaching, setReattaching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [atCapacity, setAtCapacity] = useState(false);

  // Live handles for the currently-attached run.
  const streamAbortRef = useRef<AbortController | null>(null);
  const activeRunRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      streamAbortRef.current?.abort();
      streamAbortRef.current = null;
    };
  }, []);

  const clientOptions = { serverBaseUrl, fetchImpl };
  // Keep the latest client options in a ref so callbacks don't re-create.
  const clientOptionsRef = useRef(clientOptions);
  clientOptionsRef.current = clientOptions;

  const attach = useCallback(async (nextRunId: string, seedRecord?: RmasRunRecord) => {
    // Tear down any prior stream before switching runs.
    streamAbortRef.current?.abort();
    const controller = new AbortController();
    streamAbortRef.current = controller;
    activeRunRef.current = nextRunId;

    setRunId(nextRunId);
    setTrace([]);
    setError(null);

    if (seedRecord) {
      setRecord(seedRecord);
    } else {
      try {
        const snapshot = await getRmasRun(nextRunId, clientOptionsRef.current);
        if (!mountedRef.current || activeRunRef.current !== nextRunId) return;
        setRecord(snapshot);
      } catch (caught) {
        if (!mountedRef.current || activeRunRef.current !== nextRunId) return;
        setError(caught instanceof Error ? caught.message : String(caught));
        return;
      }
    }

    // Open the live trace stream (fire-and-forget; ends on abort/close).
    void openRmasTraceStream(nextRunId, {
      serverBaseUrl,
      fetchImpl,
      signal: controller.signal,
      onSnapshot: (events) => {
        if (!mountedRef.current || activeRunRef.current !== nextRunId) return;
        setTrace(foldTraceSnapshot(events));
      },
      onEvent: (event) => {
        if (!mountedRef.current || activeRunRef.current !== nextRunId) return;
        setTrace((current) => mergeTraceEvent(current, event));
      },
      onError: (streamError) => {
        if (!mountedRef.current || activeRunRef.current !== nextRunId) return;
        setError(streamError.message);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverBaseUrl, fetchImpl]);

  // Mount-time auto-reattach to the newest running run.
  useEffect(() => {
    if (!autoReattach) return;
    let cancelled = false;
    setReattaching(true);
    listRmasRuns(clientOptionsRef.current)
      .then((summaries) => {
        if (cancelled || !mountedRef.current) return;
        const target = pickReattachRun(summaries);
        if (target) void attach(target.runId);
      })
      .catch((caught) => {
        if (cancelled || !mountedRef.current) return;
        // Reattach is best-effort — a missing/unavailable server is not an error
        // the user needs to act on; the control bar still lets them start a run.
        setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        if (!cancelled && mountedRef.current) setReattaching(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoReattach]);

  // Poll the record for status dots + token counters while the run is live.
  const running = isRunningStatus(record?.status);
  useEffect(() => {
    if (!runId || !running) return;
    let cancelled = false;
    const timer = setInterval(() => {
      getRmasRun(runId, clientOptionsRef.current)
        .then((fresh) => {
          if (cancelled || !mountedRef.current || activeRunRef.current !== runId) return;
          setRecord(fresh);
        })
        .catch(() => {
          // transient poll failure — keep the last good record, retry next tick
        });
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [runId, running]);

  // Elapsed timer (1s tick while running).
  useEffect(() => {
    setElapsedMs(elapsedMsFor(record, Date.now()));
    if (!running) return;
    const timer = setInterval(() => {
      setElapsedMs(elapsedMsFor(record, Date.now()));
    }, 1_000);
    return () => clearInterval(timer);
  }, [record, running]);

  const start = useCallback(
    async (config: RmasRunConfig) => {
      setBusy(true);
      setError(null);
      setAtCapacity(false);
      try {
        const { runId: newRunId, run } = await startRmasRun(config, clientOptionsRef.current);
        if (!mountedRef.current) return;
        await attach(newRunId, run);
      } catch (caught) {
        if (!mountedRef.current) return;
        if (caught instanceof RmasClientError && caught.status === 429) {
          setAtCapacity(true);
          setError(
            `동시 실행 한도에 도달했습니다${caught.maxConcurrent ? ` (최대 ${caught.maxConcurrent})` : ""}. 진행 중인 실행이 끝난 뒤 다시 시도하세요.`,
          );
        } else {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      } finally {
        if (mountedRef.current) setBusy(false);
      }
    },
    [attach],
  );

  const stop = useCallback(async () => {
    if (!runId) return;
    try {
      const { run } = await stopRmasRun(runId, clientOptionsRef.current);
      if (!mountedRef.current) return;
      setRecord(run);
    } catch (caught) {
      if (!mountedRef.current) return;
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [runId]);

  const clearError = useCallback(() => setError(null), []);

  return {
    runId,
    record,
    trace,
    elapsedMs,
    running,
    busy,
    reattaching,
    error,
    atCapacity,
    start,
    stop,
    clearError,
  };
}
