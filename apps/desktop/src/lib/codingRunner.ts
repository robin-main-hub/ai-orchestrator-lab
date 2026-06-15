/**
 * H8 — OpenCode-compatible Coding Runner adapter.
 *
 * OpenCode를 통째로 이식하지 않는다. 대신 Mission Workspace가 실행 가능한 *얇은
 * adapter 계약*을 정의하고, 첫 구현은 실제 호출이 아니라 결정론적 mock runner다.
 * 나중에 진짜 OpenCode/로컬 CLI runner는 같은 CodingRunner 인터페이스만 구현하면
 * UI/상태 코드를 안 건드리고 끼울 수 있다.
 *
 * 안전 계약 (불변):
 *  - runner는 변경 *제안*(changedFiles + diffSummary)만 낸다. 실제 파일 수정/적용은
 *    별도 사용자 승인 단계의 몫 — runner가 자동으로 디스크를 바꾸지 않는다.
 *  - 자동 GitHub write/PR 금지. runner 출력은 로컬 요약일 뿐.
 *  - observed=true는 실제 결과가 관측됐을 때만(mock은 observed=false 표식 유지).
 *
 * 순수 코어 + 주입 가능한 스케줄러/시계 → 헤드리스 테스트 가능.
 */

export type CodingRunnerTool = "read" | "grep" | "glob" | "bash" | "write" | "edit" | "test";

export type CodingRunRequest = {
  missionId: string;
  /** 실행 대상 repo 루트 (AppWorkspace.repoRootRef) */
  repoRoot: string;
  prompt: string;
  /** 이 run에 허용된 도구 — 변경 도구가 없으면 read-only run */
  allowedTools: CodingRunnerTool[];
};

export type CodingRunStatus = "idle" | "running" | "completed" | "failed" | "stopped";

export type CodingLogStream = "system" | "stdout" | "stderr" | "tool";

export type CodingLogChunk = {
  at: string;
  stream: CodingLogStream;
  text: string;
};

export type ChangedFileSummary = {
  path: string;
  change: "added" | "modified" | "deleted";
  additions: number;
  deletions: number;
};

export type TestResultSummary = {
  ran: boolean;
  passed: number;
  failed: number;
  durationMs?: number;
};

export type CodingRunResult = {
  status: "completed" | "failed" | "stopped";
  logChunks: CodingLogChunk[];
  /** 제안된 변경 파일 요약 (적용 아님 — 승인 단계가 따로 적용) */
  changedFiles: ChangedFileSummary[];
  /** DiffView용 unified diff 텍스트 (제안) */
  diffSummary: string;
  testResult: TestResultSummary;
  /** status==="failed"일 때만 */
  errorSummary?: string;
  startedAt: string;
  endedAt: string;
  /** mock/시뮬레이션은 false. 실제 runner가 결과를 관측했을 때만 true */
  observed: boolean;
};

export type CodingRunnerHooks = {
  onLog?: (chunk: CodingLogChunk) => void;
  onStatus?: (status: CodingRunStatus) => void;
};

export type CodingRunHandle = {
  /** 진행 중 중지 — done이 status:"stopped"로 resolve */
  stop: () => void;
  done: Promise<CodingRunResult>;
};

export interface CodingRunner {
  readonly id: string;
  readonly label: string;
  /** runner가 실제 디스크/원격을 건드리는가 (mock=false) */
  readonly observes: boolean;
  run(request: CodingRunRequest, hooks?: CodingRunnerHooks): CodingRunHandle;
}

// ── UI가 들고 있는 run 상태 reducer (순수) ──

export type CodingRunnerState = {
  status: CodingRunStatus;
  logs: CodingLogChunk[];
  result?: CodingRunResult;
  request?: CodingRunRequest;
};

export function initialRunnerState(): CodingRunnerState {
  return { status: "idle", logs: [] };
}

export function startRunnerState(state: CodingRunnerState, request: CodingRunRequest): CodingRunnerState {
  return { status: "running", logs: [], result: undefined, request };
}

export function appendRunnerLog(state: CodingRunnerState, chunk: CodingLogChunk, cap = 500): CodingRunnerState {
  const logs = [...state.logs, chunk];
  return { ...state, logs: logs.length > cap ? logs.slice(logs.length - cap) : logs };
}

export function setRunnerStatus(state: CodingRunnerState, status: CodingRunStatus): CodingRunnerState {
  return { ...state, status };
}

export function settleRunnerState(state: CodingRunnerState, result: CodingRunResult): CodingRunnerState {
  return { ...state, status: result.status, result };
}

/** 변경 파일 요약 → 한 줄 통계 ("3 files · +42 / -7") */
export function summarizeChangedFiles(files: ReadonlyArray<ChangedFileSummary>): string {
  if (files.length === 0) return "변경 없음";
  const add = files.reduce((sum, f) => sum + f.additions, 0);
  const del = files.reduce((sum, f) => sum + f.deletions, 0);
  return `${files.length}개 파일 · +${add} / -${del}`;
}

/** allowedTools에 변경 도구가 있는가 */
export function isMutatingRun(allowedTools: ReadonlyArray<CodingRunnerTool>): boolean {
  return allowedTools.some((tool) => tool === "write" || tool === "edit" || tool === "bash");
}

// ── Mock runner (첫 구현) ──

export type MockRunnerScenario = "success" | "failed" | "no_changes";

export type MockCodingRunnerDeps = {
  /** 단계 사이 대기 — 테스트는 즉시 resolve 주입 */
  wait?: (ms: number) => Promise<void>;
  now?: () => string;
  scenario?: MockRunnerScenario;
  /** 단계 간 지연(ms) — 실제 UX용, 테스트는 wait 주입으로 무시 */
  stepDelayMs?: number;
};

const DEFAULT_WAIT = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 결정론적 mock — OpenCode 스타일 run을 흉내낸다(로그 스트림 → 제안 diff → 테스트 요약).
 * 디스크/원격은 절대 건드리지 않는다. scenario로 실패/무변경 분기 검증 가능.
 */
export function createMockCodingRunner(deps: MockCodingRunnerDeps = {}): CodingRunner {
  const wait = deps.wait ?? DEFAULT_WAIT;
  const now = deps.now ?? (() => new Date().toISOString());
  const scenario = deps.scenario ?? "success";
  const stepDelay = deps.stepDelayMs ?? 350;

  return {
    id: "mock",
    label: "Mock Runner (시뮬레이션)",
    observes: false,
    run(request, hooks) {
      let stopped = false;
      const logs: CodingLogChunk[] = [];
      const emit = (stream: CodingLogStream, text: string) => {
        const chunk = { at: now(), stream, text };
        logs.push(chunk);
        hooks?.onLog?.(chunk);
      };

      const done = (async (): Promise<CodingRunResult> => {
        const startedAt = now();
        hooks?.onStatus?.("running");
        emit("system", `attach: ${request.repoRoot} (mission ${request.missionId})`);
        emit("system", `prompt: ${request.prompt.slice(0, 120)}`);
        emit("system", `allowed tools: ${request.allowedTools.join(", ") || "(read-only)"}`);

        const steps: Array<[CodingLogStream, string]> = [
          ["tool", "read package.json"],
          ["tool", "grep \"TODO\" src/"],
          ["stdout", "스캔 완료 — 후보 3곳"],
          ["tool", "edit src/App.tsx (제안)"],
          ["stdout", "변경 제안 작성 — 적용은 승인 후"],
        ];
        for (const [stream, text] of steps) {
          if (stopped) break;
          await wait(stepDelay);
          if (stopped) break;
          emit(stream, text);
        }

        if (stopped) {
          emit("system", "사용자 중지 — 변경 미적용");
          hooks?.onStatus?.("stopped");
          return {
            status: "stopped",
            logChunks: logs,
            changedFiles: [],
            diffSummary: "",
            testResult: { ran: false, passed: 0, failed: 0 },
            startedAt,
            endedAt: now(),
            observed: false,
          };
        }

        if (scenario === "failed") {
          emit("stderr", "Error: TypeError: cannot read property 'x' of undefined (src/App.tsx:42)");
          hooks?.onStatus?.("failed");
          return {
            status: "failed",
            logChunks: logs,
            changedFiles: [],
            diffSummary: "",
            testResult: { ran: true, passed: 12, failed: 1, durationMs: 1840 },
            errorSummary: "TypeError: cannot read property 'x' of undefined (src/App.tsx:42) — 변경 미적용",
            startedAt,
            endedAt: now(),
            observed: false,
          };
        }

        const changedFiles: ChangedFileSummary[] =
          scenario === "no_changes"
            ? []
            : [
                { path: "src/App.tsx", change: "modified", additions: 12, deletions: 3 },
                { path: "src/lib/util.ts", change: "added", additions: 30, deletions: 0 },
              ];
        const diffSummary =
          scenario === "no_changes"
            ? ""
            : [
                "--- a/src/App.tsx",
                "+++ b/src/App.tsx",
                "@@ -39,7 +39,16 @@",
                "-  const x = undefined;",
                "+  const x = props.value ?? fallback;",
                "+  // null-guarded per prompt",
              ].join("\n");
        await wait(stepDelay);
        emit("tool", "test: pnpm typecheck");
        emit("stdout", scenario === "no_changes" ? "변경 없음 — 제안할 패치 없음" : "typecheck 통과");
        hooks?.onStatus?.("completed");
        return {
          status: "completed",
          logChunks: logs,
          changedFiles,
          diffSummary,
          testResult: { ran: true, passed: scenario === "no_changes" ? 12 : 13, failed: 0, durationMs: 1620 },
          startedAt,
          endedAt: now(),
          observed: false,
        };
      })();

      return { stop: () => { stopped = true; }, done };
    },
  };
}
