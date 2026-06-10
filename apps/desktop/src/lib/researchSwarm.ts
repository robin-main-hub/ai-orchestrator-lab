/**
 * 리서치 스웜 — Kimi Agent Swarm + Manus research 스타일의 순수 모델.
 *
 * 구성 (스크린샷 기준 사용자가 지목한 장점):
 *  - 마스터 플랜: 단계 체크리스트 + Task Progress x/y      (Manus 좌측)
 *  - 요원 명단: 페르소나 요원 N명, 각자 한 줄 임무 + 진행 도트 (Kimi 좌측)
 *  - Agent's Computer: 선택 요원의 활동 타임라인
 *    (Think / Write Todo / Search N results / Browsing URL /
 *     Execute Terminal / Creating file — 접고 펼치기)      (Kimi 우측)
 *  - 하단 요원 스트립: 아바타 + 번호 + 회전하는 동사 상태    (Kimi 하단)
 *  - 조사 노트: 요원이 markdown 노트를 파일로 남김          (Manus 산출물)
 *
 * 전부 순수 데이터 + 리듀서. 실행(도구 루프, 게이트 디스패치)은
 * researchSwarmRunner가 담당한다.
 */

export type ResearchStepKind =
  | "think"
  | "todo"
  | "search"
  | "browse"
  | "terminal"
  | "write_file";

export type ResearchStep = {
  id: string;
  kind: ResearchStepKind;
  /** 한 줄 제목 (검색어, URL, 파일 경로, 생각 요약…) */
  title: string;
  /** 펼쳤을 때 보이는 본문 (검색 결과, 페이지 발췌, 노트 내용…) */
  output?: string;
  /** search 전용: 결과 개수 표기 */
  resultCount?: number;
  status: "running" | "done" | "failed" | "denied";
  at: string;
};

export type ResearchAgentStatus = "queued" | "running" | "done" | "failed" | "offline";

export type ResearchAgentRun = {
  id: string;
  /** 도감 슬러그 — 아바타/표정 자동 바인딩 */
  personaName: string;
  displayName: string;
  /** 한 줄 임무 (Kimi 좌측 리스트의 서브타이틀) */
  task: string;
  status: ResearchAgentStatus;
  /** 하단 스트립의 현재 동사 (분석 중/수집 중/…) */
  statusVerb: string;
  steps: ResearchStep[];
  /** 마지막 텍스트 결론 (도구 없이 끝난 최종 답변) */
  conclusion?: string;
  error?: string;
};

export type MasterPlanPhase = { title: string; done: boolean };

export type ResearchSwarmState = {
  /** 전체 조사 주제 */
  topic: string;
  plan: MasterPlanPhase[];
  agents: ResearchAgentRun[];
  /** 우측 Agent's Computer가 보고 있는 요원 */
  viewingAgentId: string | null;
  startedAt?: string;
  finishedAt?: string;
};

// ─── 동사 상태 (Kimi 하단 스트립) ────────────────────────────────────────────

const VERB_BY_KIND: Record<ResearchStepKind, string[]> = {
  think: ["분석 중", "추론 중", "검토 중"],
  todo: ["계획 중", "정리 중"],
  search: ["수집 중", "탐색 중", "검색 중"],
  browse: ["정독 중", "열람 중"],
  terminal: ["실행 중", "확인 중"],
  write_file: ["기록 중", "집필 중"],
};

export function verbForStep(kind: ResearchStepKind, stepIndex: number): string {
  const verbs = VERB_BY_KIND[kind];
  return verbs[stepIndex % verbs.length]!;
}

// ─── 생성 ────────────────────────────────────────────────────────────────────

export function createResearchSwarm(input: {
  topic: string;
  plan: string[];
  agents: Array<{ id: string; personaName: string; displayName: string; task: string }>;
  now: string;
}): ResearchSwarmState {
  return {
    topic: input.topic,
    plan: input.plan.map((title) => ({ title, done: false })),
    agents: input.agents.map((agent) => ({
      ...agent,
      status: "queued",
      statusVerb: "대기 중",
      steps: [],
    })),
    viewingAgentId: input.agents[0]?.id ?? null,
    startedAt: input.now,
  };
}

// ─── 리듀서 ──────────────────────────────────────────────────────────────────

function mapAgent(
  state: ResearchSwarmState,
  agentId: string,
  map: (run: ResearchAgentRun) => ResearchAgentRun,
): ResearchSwarmState {
  return { ...state, agents: state.agents.map((run) => (run.id === agentId ? map(run) : run)) };
}

export function markAgentRunning(state: ResearchSwarmState, agentId: string): ResearchSwarmState {
  return mapAgent(state, agentId, (run) => ({ ...run, status: "running", statusVerb: "착수 중" }));
}

export function appendStep(
  state: ResearchSwarmState,
  agentId: string,
  step: Omit<ResearchStep, "status"> & { status?: ResearchStep["status"] },
): ResearchSwarmState {
  return mapAgent(state, agentId, (run) => ({
    ...run,
    steps: [...run.steps, { status: "running", ...step }],
    statusVerb: verbForStep(step.kind, run.steps.length),
  }));
}

export function settleStep(
  state: ResearchSwarmState,
  agentId: string,
  stepId: string,
  patch: Partial<Pick<ResearchStep, "output" | "resultCount" | "status" | "title">>,
): ResearchSwarmState {
  return mapAgent(state, agentId, (run) => ({
    ...run,
    steps: run.steps.map((step) =>
      step.id === stepId ? { ...step, status: "done", ...patch } : step,
    ),
  }));
}

const TERMINAL_VERB: Record<"done" | "failed" | "offline", string> = {
  done: "완료",
  failed: "실패",
  offline: "오프라인",
};

export function finishAgent(
  state: ResearchSwarmState,
  agentId: string,
  outcome: { status: "done" | "failed" | "offline"; conclusion?: string; error?: string },
): ResearchSwarmState {
  return mapAgent(state, agentId, (run) => ({
    ...run,
    status: outcome.status,
    statusVerb: TERMINAL_VERB[outcome.status],
    conclusion: outcome.conclusion ?? run.conclusion,
    error: outcome.error,
  }));
}

/** 서버 unreachable 등으로 전체 스웜을 중단할 때 — 미종료 요원을 오프라인으로 */
export function markSwarmOffline(state: ResearchSwarmState, reason: string): ResearchSwarmState {
  return {
    ...state,
    agents: state.agents.map((run) =>
      run.status === "queued" || run.status === "running"
        ? { ...run, status: "offline", statusVerb: "오프라인", error: reason }
        : run,
    ),
  };
}

export function setViewing(state: ResearchSwarmState, agentId: string): ResearchSwarmState {
  return { ...state, viewingAgentId: agentId };
}

/**
 * 마스터 플랜 자동 체크 — LLM 자기보고도, "에이전트 종료 수"도 아닌 **관측된
 * 성공 증거**에서 유도한다 (적대 검증 반영). 실패/오프라인 요원은 진척으로
 * 치지 않으므로, 서버가 죽어 전원 실패하면 플랜이 녹색이 되는 일이 없다.
 *
 *  - 1단계(배치): 한 명이라도 착수했는가
 *  - 중간 단계들: **성공(done) 요원 비율**이 단계 위치를 넘는가
 *  - 마지막 단계(보고): 전원 종료 + done이 1명 이상
 */
export function derivePlanProgress(state: ResearchSwarmState): ResearchSwarmState {
  const total = state.agents.length || 1;
  const done = state.agents.filter((run) => run.status === "done").length;
  const settled = state.agents.filter(
    (run) => run.status === "done" || run.status === "failed" || run.status === "offline",
  ).length;
  const anyStarted = state.agents.some((run) => run.status !== "queued");
  const phases = state.plan.length;
  const plan = state.plan.map((phase, index) => {
    if (index === 0) return { ...phase, done: anyStarted };
    if (index === phases - 1) return { ...phase, done: settled === total && done > 0 };
    return { ...phase, done: done / total >= index / Math.max(1, phases - 1) };
  });
  const allSettled = settled === total && state.agents.length > 0;
  return {
    ...state,
    plan,
    finishedAt: allSettled ? state.finishedAt ?? state.startedAt : undefined,
  };
}

/** 실패/오프라인 요원 수 — 플랜이 아닌 경고 배지로 노출 (녹색 오염 방지) */
export function failedAgentCount(state: ResearchSwarmState): number {
  return state.agents.filter((run) => run.status === "failed" || run.status === "offline").length;
}

export function progressLabel(state: ResearchSwarmState): string {
  const done = state.plan.filter((phase) => phase.done).length;
  return `${done}/${state.plan.length}`;
}

/**
 * Kimi 좌측 리스트의 진행 도트. 무비용 스텝(think/todo)이 진척을 부풀리지
 * 않도록, **실제 산출 스텝(search/browse/terminal/write_file의 done)**만 채운다
 * (적대 검증 반영). 종료된 요원은 전부 채워서 완료를 분명히 표시.
 */
export function progressDots(run: ResearchAgentRun, slots = 12): boolean[] {
  if (run.status === "done") return Array.from({ length: slots }, () => true);
  const productive = run.steps.filter(
    (step) => step.kind !== "think" && step.kind !== "todo" && step.status === "done",
  ).length;
  const filled = Math.min(productive, slots);
  return Array.from({ length: slots }, (_, index) => index < filled);
}
