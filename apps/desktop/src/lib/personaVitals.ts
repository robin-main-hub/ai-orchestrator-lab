import type { AgentMemoryQualityState } from "./agentMemoryQuality";

/**
 * 페르소나 "바이탈"(HP=기억 품질, MP=신뢰)의 실측 신호 리졸버. 실제 신호가 있을 때만
 * 값을 내고, 없으면 null 을 돌려 호출부가 기본치(카드 tier 등)로 폴백하도록 한다.
 * 순수 함수 — 저장소는 주입 가능(테스트/SSR 안전).
 */

export const PERSONA_RUN_HISTORY_KEY = "ai-orch.personaRunHistory.v1";

/** 기억 품질 신호 → HP(0..1). healthy/building/empty 만 실측으로 취급한다. */
export const MEMORY_HP_BY_SIGNAL: Record<"healthy" | "building" | "empty", number> = {
  healthy: 0.9,
  building: 0.65,
  empty: 0.45,
};

export interface PersonaVital {
  value: number;
  source: "signal" | "history";
}

/**
 * 기억 품질 상태 → HP. AgentMemoryQualityState 는 문자열 union
 * ("building" | "empty" | "error" | "healthy" | "loading") 이므로 문자열로 스위치한다.
 * error/loading/undefined 는 실측 신호가 아니므로 null(기본치 폴백).
 */
export function resolveMemoryHp(state?: AgentMemoryQualityState): PersonaVital | null {
  switch (state) {
    case "healthy":
      return { value: MEMORY_HP_BY_SIGNAL.healthy, source: "signal" };
    case "building":
      return { value: MEMORY_HP_BY_SIGNAL.building, source: "signal" };
    case "empty":
      return { value: MEMORY_HP_BY_SIGNAL.empty, source: "signal" };
    default:
      return null;
  }
}

export interface PersonaRunHistoryEntry {
  personaName: string;
  status: string;
}

/** status === "completed" 를 성공으로 본다. */
function isCompleted(entry: PersonaRunHistoryEntry): boolean {
  return entry.status === "completed";
}

/**
 * 페르소나 실행 이력을 저장소에서 읽는다. 없음/깨진 JSON/비배열 이면 []. 항목은
 * 문자열 personaName 을 가진 객체만 남기고, status 는 문자열로 정규화한다.
 */
export function readPersonaRunHistory(storage?: Storage): PersonaRunHistoryEntry[] {
  const store = storage ?? (typeof localStorage !== "undefined" ? localStorage : undefined);
  if (!store) return [];

  let raw: string | null;
  try {
    raw = store.getItem(PERSONA_RUN_HISTORY_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter(
      (entry): entry is { personaName: string; status?: unknown } =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as { personaName?: unknown }).personaName === "string",
    )
    .map((entry) => ({
      personaName: entry.personaName,
      status: typeof entry.status === "string" ? entry.status : "",
    }));
}

/**
 * 신뢰(MP) = 이 페르소나의 완료율. 샘플이 3건 미만이면 통계로 부적절 → null(기본치 폴백).
 */
export function resolveTrustMp(
  personaName: string,
  history: PersonaRunHistoryEntry[],
): PersonaVital | null {
  const entries = history.filter((entry) => entry.personaName === personaName);
  if (entries.length < 3) return null;
  const completed = entries.filter(isCompleted).length;
  return { value: completed / entries.length, source: "history" };
}

export interface PersonaVitalsResult {
  memoryQuality?: number;
  trust?: number;
  hpIsDefault: boolean;
  mpIsDefault: boolean;
}

/**
 * HP·MP 신호를 합쳐 카드/칩에 넘길 값과 "기본치 여부" 플래그를 만든다. 신호가 없으면
 * 값은 undefined 로 두고 *IsDefault 를 true 로 세워, 호출부가 tier 기본치를 쓰게 한다.
 */
export function computePersonaVitals(input: {
  personaName: string;
  memoryState?: AgentMemoryQualityState;
  history?: PersonaRunHistoryEntry[];
}): PersonaVitalsResult {
  const hp = resolveMemoryHp(input.memoryState);
  const history = input.history ?? readPersonaRunHistory();
  const mp = resolveTrustMp(input.personaName, history);
  return {
    memoryQuality: hp?.value,
    trust: mp?.value,
    hpIsDefault: hp === null,
    mpIsDefault: mp === null,
  };
}
