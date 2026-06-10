import type { TmuxPaneRole } from "@ai-orchestrator/protocol";

/**
 * 진짜 터미널 — dgx-swarm tmux pane의 실제 출력을 capture-pane으로 가져와 보여주는
 * 라이브 뷰의 순수 코어. capture는 읽기 전용이라 승인 게이트가 필요 없다(서버
 * swarm-capture.sh가 `tmux capture-pane -p`를 그대로 실행). 명령 전송은 별도로
 * 기존 dispatch 게이트(승인→replay→send-keys)를 탄다.
 *
 * 폴링/네트워크는 주입(capture fn)하므로 이 모듈은 순수·테스트 가능.
 */

export const SWARM_ROLES: ReadonlyArray<TmuxPaneRole> = [
  "discussion",
  "orchestrator",
  "status",
  "code",
  "architect",
  "frontend",
  "backend",
  "qa",
  "research",
  "memory",
];

export const SWARM_ROLE_LABEL: Record<TmuxPaneRole, string> = {
  discussion: "논의",
  orchestrator: "지휘",
  status: "상태",
  code: "코드",
  architect: "설계",
  frontend: "프론트",
  backend: "백엔드",
  qa: "검증",
  research: "조사",
  memory: "기억",
};

export type LiveTerminalStatus = "idle" | "polling" | "live" | "disabled" | "error";

export type LiveTerminalState = {
  role: TmuxPaneRole;
  sessionName: string;
  status: LiveTerminalStatus;
  /** 마지막으로 capture된 pane 출력 */
  output: string;
  paneId?: string;
  lineCount?: number;
  error?: string;
  /** 마지막 갱신 시각 ISO */
  updatedAt?: string;
};

export function createLiveTerminalState(input: {
  role?: TmuxPaneRole;
  sessionName?: string;
}): LiveTerminalState {
  return {
    role: input.role ?? "orchestrator",
    sessionName: input.sessionName ?? "ai-swarm",
    status: "idle",
    output: "",
  };
}

export type CaptureOutcome =
  | { status: "captured"; output: string; paneId?: string; lineCount?: number }
  | { status: "disabled"; reason?: string }
  | { status: "failed"; reason: string };

/** capture 결과를 상태에 반영. live↔error 전이를 명확히 한다. */
export function applyCapture(
  state: LiveTerminalState,
  outcome: CaptureOutcome,
  now: string,
): LiveTerminalState {
  if (outcome.status === "captured") {
    return {
      ...state,
      status: "live",
      output: outcome.output,
      paneId: outcome.paneId ?? state.paneId,
      lineCount: outcome.lineCount,
      error: undefined,
      updatedAt: now,
    };
  }
  if (outcome.status === "disabled") {
    return { ...state, status: "disabled", error: outcome.reason, updatedAt: now };
  }
  return { ...state, status: "error", error: outcome.reason, updatedAt: now };
}

export function setRole(state: LiveTerminalState, role: TmuxPaneRole): LiveTerminalState {
  // 역할을 바꾸면 출력은 비우고 다음 capture를 기다린다 (다른 pane의 잔상 방지)
  return { ...state, role, output: "", paneId: undefined, lineCount: undefined, status: "idle" };
}

export function setPolling(state: LiveTerminalState): LiveTerminalState {
  return state.status === "live" ? state : { ...state, status: "polling" };
}

export type LiveTerminalTimers = {
  setInterval: (handler: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
};

/**
 * capture를 intervalMs마다 실행. 겹침 방지(이전 capture가 안 끝났으면 스킵),
 * 즉시 1회 실행 후 주기 반복. 타이머 주입으로 테스트 가능.
 */
export function startLiveCaptureLoop(input: {
  intervalMs: number;
  tick: () => Promise<void>;
  timers?: LiveTerminalTimers;
}): { stop: () => void } {
  const timers = input.timers ?? {
    setInterval: (handler, ms) => globalThis.setInterval(handler, ms),
    clearInterval: (handle) => globalThis.clearInterval(handle as Parameters<typeof globalThis.clearInterval>[0]),
  };
  let inFlight = false;
  const run = () => {
    if (inFlight) return;
    inFlight = true;
    void input.tick().catch(() => {}).finally(() => {
      inFlight = false;
    });
  };
  run(); // 즉시 1회
  const handle = timers.setInterval(run, input.intervalMs);
  return { stop: () => timers.clearInterval(handle) };
}
