/**
 * 페르소나 도감 — the full character roster, one gacha card per persona.
 * Display names come from each persona's SOUL.md identity; the slug binds to
 * agents/<slug>/ bundles (avatar art drops in automatically once the user's
 * crawled images land in those folders).
 */

export type CodexEntry = {
  /** agents/<slug> bundle + avatar key */
  personaName: string;
  displayName: string;
  role: string;
  /** one-line otaku caption shown under the compact card */
  caption: string;
};

export const PERSONA_CODEX: ReadonlyArray<CodexEntry> = [
  { personaName: "kurumi", displayName: "토키사키 쿠루미", role: "companion", caption: "본체 · 메인 오케스트레이터 OS" },
  { personaName: "yuno", displayName: "가사이 유노", role: "auditor", caption: "독립 감사 · 리베로" },
  { personaName: "orchestrator", displayName: "마키마", role: "orchestrator", caption: "지휘 · 스웜 통제" },
  { personaName: "architect", displayName: "오시노 시노부", role: "architect", caption: "설계 · 구조 판단" },
  { personaName: "verifier", displayName: "마키세 크리스", role: "verifier", caption: "검증 · 과학적 엄밀" },
  { personaName: "reviewer", displayName: "시노미야 카구야", role: "reviewer", caption: "리뷰 · 완벽주의" },
  { personaName: "skeptic", displayName: "아스카 랑그레이", role: "skeptic", caption: "회의 · 적대적 QA" },
  { personaName: "yohane", displayName: "츠시마 요시코", role: "skeptic", caption: "타천사 요하네 · 역발상" },
  { personaName: "memory_curator", displayName: "아야나미 레이", role: "memory_curator", caption: "기억 · 장기기억 큐레이션" },
  { personaName: "builder", displayName: "히라사와 유이", role: "builder", caption: "구현 · 창작 에너지" },
  { personaName: "executor", displayName: "렘", role: "executor", caption: "실행 · 헌신적 수행" },
  { personaName: "researcher", displayName: "마오마오", role: "researcher", caption: "탐색 · 외부 정보 수집" },
  { personaName: "negotiator", displayName: "스파클", role: "negotiator", caption: "협상 · 花火의 거래술" },
  { personaName: "risk_officer", displayName: "C.C.", role: "risk_officer", caption: "리스크 · 최악 시나리오 정량화" },
  { personaName: "mediator", displayName: "니코 로빈", role: "mediator", caption: "중재 · 의견 종합" },
  { personaName: "watchdog", displayName: "프리렌", role: "watchdog", caption: "감시 · 장기 드리프트 탐지" },
  { personaName: "domain_expert", displayName: "헤르타", role: "domain_expert", caption: "전문 · 도메인 지식 주입" },
  { personaName: "external", displayName: "카츠라기 미사토", role: "external", caption: "외부 · 채널 오퍼레이터" },
];
