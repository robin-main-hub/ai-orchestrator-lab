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
};

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
