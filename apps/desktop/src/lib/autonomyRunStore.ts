import type { AutonomyRunForm } from "./autonomyRunForm";
import type { AutonomyStepRow } from "./autonomyTimeline";
import type { PersonaTaskOutcome } from "./personaTaskRunner";

/**
 * 자율 실행의 라이브 상태를 컴포넌트 밖에 보관하는 외부 스토어.
 *
 * 실행 탭(RunWorkspace)은 다른 네비로 이동하는 순간 언마운트된다 — 승인하러
 * 관제판에 다녀오면 진행 중이던 미션의 타임라인/결과/폼이 통째로 사라지던
 * 원인. 미션 상태를 모듈 전역에 두면 컴포넌트는 구독자일 뿐이라 탭을
 * 오가도 실행은 계속 보인다. (실행 자체는 await 중인 프라미스로 이미 살아
 * 있었고, 보여줄 곳만 죽었던 것.)
 */

export type AutonomyRunLiveState = {
  running: boolean;
  steps: AutonomyStepRow[];
  outcome: PersonaTaskOutcome | null;
  error: string | null;
  /** 마지막으로 편집한 폼 — 탭 이동 후 복원용 */
  formDraft: AutonomyRunForm | null;
  /** 디스패치가 사람 승인을 기다리는 중일 때의 안내 (없으면 null) — 침묵 대기 방지 */
  approvalWaitNote: string | null;
  /** 진행 중 실행의 id — 홈 "현재 작업" 카드 노출용 (없으면 null) */
  runId: string | null;
  /** 진행 중 실행의 목표문 — 홈 카드 라벨용 */
  goal: string | null;
  /** 실행 시작 시각(ISO) — 경과 타이머용 */
  startedAt: string | null;
  /** 진행 중 실행의 중지 핸들 — AbortController.abort()를 감싼다 (없으면 null) */
  abort: (() => void) | null;
  /** 중지 요청됨(중지 처리 중) — 홈 카드의 "중지 중" 스피너용 */
  cancelling: boolean;
};

export type AutonomyRunStore = {
  get: () => AutonomyRunLiveState;
  set: (patch: Partial<AutonomyRunLiveState>) => void;
  subscribe: (listener: () => void) => () => void;
  reset: () => void;
};

const INITIAL: AutonomyRunLiveState = {
  running: false,
  steps: [],
  outcome: null,
  error: null,
  formDraft: null,
  approvalWaitNote: null,
  runId: null,
  goal: null,
  startedAt: null,
  abort: null,
  cancelling: false,
};

/**
 * mode B 로그에서 "사람 승인 대기" 신호를 추출한다. 자동승인 불가 명령이
 * 조용히 2분 폴링에 들어가 "멈춘 것처럼" 보이던 문제의 안내 문구 생성기.
 * 해당 없으면 null.
 */
export function approvalWaitNoteFromLog(message: string): string | null {
  if (!message.includes("deferring to human")) {
    return null;
  }
  const quoted = /^mode B: "([\s\S]*?)" not auto-approvable/.exec(message)?.[1];
  const preview = quoted ? `"${quoted.length > 48 ? `${quoted.slice(0, 47)}…` : quoted}"` : "이 단계";
  return `${preview} — 자동승인 불가, 승인 큐에서 사람 승인이 필요합니다`;
}

export function createAutonomyRunStore(seed: Partial<AutonomyRunLiveState> = {}): AutonomyRunStore {
  let state: AutonomyRunLiveState = { ...INITIAL, ...seed };
  const listeners = new Set<() => void>();

  return {
    get: () => state,
    set: (patch) => {
      state = { ...state, ...patch };
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reset: () => {
      state = { ...INITIAL };
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

/** 앱 전역 싱글톤 — 실행 탭이 몇 번을 마운트/언마운트돼도 같은 미션을 본다 */
export const autonomyRunStore = createAutonomyRunStore();

/**
 * 마운트 시 폼 초기값 규칙:
 *   1. 도감 소환(seedPersonaName)은 명시적 의도 — 시드가 드래프트를 덮는다
 *   2. 그 외엔 사용자가 마지막으로 편집한 드래프트 복원
 *   3. 드래프트도 없으면 패킷 시드/기본값
 */
export function resolveInitialAutonomyForm(input: {
  draft: AutonomyRunForm | null;
  seeded: AutonomyRunForm;
  seedPersonaName?: string;
}): AutonomyRunForm {
  if (input.seedPersonaName) {
    return input.seeded;
  }
  return input.draft ?? input.seeded;
}
