import type { CodexEntry } from "./personaCodex";

/**
 * 대시보드 "소환진 — 오늘의 파티" 선발(순수). 하드코딩 2명 대신, 날짜로 로테이션하되
 * 지금 실제로 활성인(Hermes 슬롯 점유)·최근 작전에 쓴 페르소나를 앞세운다. 날짜가
 * 바뀌면 추천이 돌고, 활동이 있으면 그게 반영된다 — "왜 오늘 이 파티인가"를 reason으로.
 *
 * 순수 함수 — 단위 테스트된다. dateSeed는 호출부에서 오늘 날짜 문자열로 주입(테스트 가능).
 */
export type DailyPartyMember = {
  personaName: string;
  displayName: string;
  role: string;
  tagline: string;
  /** 오늘 이 파티에 든 이유 (활성/최근/추천) */
  reason: string;
};

export function selectDailyParty(input: {
  codex: ReadonlyArray<CodexEntry>;
  /** 최근 작전에 등장한 personaName (최신순) */
  recentPersonaNames?: ReadonlyArray<string>;
  /** Hermes 슬롯에 현재 바인딩된 personaName (지금 활성) */
  boundPersonaNames?: ReadonlyArray<string>;
  /** 오늘 날짜 시드 (예: "2026-06-13") — 일자별 로테이션 */
  dateSeed: string;
  size?: number;
}): DailyPartyMember[] {
  const { codex, recentPersonaNames = [], boundPersonaNames = [], dateSeed, size = 3 } = input;
  if (codex.length === 0) return [];
  const byName = new Map(codex.map((entry) => [entry.personaName, entry]));
  const seed = [...dateSeed].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  // 날짜 시드로 회전한 후보 순서 — 일자가 바뀌면 추천 채움이 달라진다
  const rotated = codex.map((_, index) => codex[(index + seed) % codex.length]!);

  const picked: Array<{ entry: CodexEntry; reason: string }> = [];
  const seen = new Set<string>();
  const add = (name: string, reason: string) => {
    const entry = byName.get(name);
    if (!entry || seen.has(name)) return;
    seen.add(name);
    picked.push({ entry, reason });
  };

  for (const name of boundPersonaNames) add(name, "오늘 활성");
  for (const name of recentPersonaNames) add(name, "최근 작전");
  for (const entry of rotated) add(entry.personaName, "오늘의 추천");

  return picked.slice(0, Math.max(1, size)).map(({ entry, reason }) => ({
    personaName: entry.personaName,
    displayName: entry.displayName,
    role: entry.role,
    tagline: entry.caption,
    reason,
  }));
}
