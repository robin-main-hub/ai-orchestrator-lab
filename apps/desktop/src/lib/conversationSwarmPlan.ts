import { PERSONA_CODEX } from "./personaCodex";

/**
 * 대화 내용(주제) → 자동 스웜 편성(순수). 다른 AI앱의 MCP 탭처럼 대화창에서 "스웜
 * 서치"를 고르면, 주제의 무게에 따라 4~16명을 동적으로 뽑고 각자에게 역할에 맞는
 * 조사 측면(facet)을 자동 분담한다. (현재 리서치 스웜은 6명 고정 + 빈 임무 한 줄
 * 폴백뿐이라, 이 동적 편성 로직이 없었다.)
 *
 * 실제 조사 자체는 기존 researchSwarmRunner(LLM)가 수행한다 — 여기서는 "몇 명을,
 * 누구에게, 어떤 측면을" 결정하는 결정적 편성만 한다(테스트 가능, 서버 비의존).
 */
export type SwarmDraft = {
  personaName: string;
  displayName: string;
  role: string;
  task: string;
};

export type ConversationSwarmPlan = {
  topic: string;
  drafts: SwarmDraft[];
  count: number;
};

/** 조사에 적합한 역할 — 서로 다른 시점을 주도록 우선순위 순으로 배치 */
const RESEARCH_ROSTER: ReadonlyArray<{ role: string; facet: string }> = [
  { role: "researcher", facet: "광역 1차 탐색 — 핵심 사실과 출처 수집" },
  { role: "domain_expert", facet: "도메인 심층 — 전문 맥락과 메커니즘" },
  { role: "verifier", facet: "사실 교차 검증 — 상충/근거 확인" },
  { role: "auditor", facet: "리스크·반례 점검 — 약점과 예외" },
  { role: "skeptic", facet: "적대적 반박 — 통념에 대한 역발상" },
  { role: "mediator", facet: "관점 종합 — 상충 의견 조정" },
  { role: "risk_officer", facet: "최악 시나리오 정량화 — 영향과 확률" },
  { role: "negotiator", facet: "트레이드오프 비교 — 대안 간 우열" },
  { role: "watchdog", facet: "최신성·드리프트 — 변화와 신선도 감시" },
  { role: "domain_expert", facet: "인접 분야 연결 — 유사 사례·전이" },
  { role: "researcher", facet: "정량 데이터 — 수치·벤치마크 수집" },
  { role: "reviewer", facet: "품질 리뷰 — 결론의 완결성 점검" },
  { role: "memory_curator", facet: "기존 기억 연결 — 과거 작업과의 정합" },
  { role: "verifier", facet: "재현·실증 — 주장 직접 확인" },
  { role: "auditor", facet: "출처 신뢰도 — 인용 추적" },
  { role: "mediator", facet: "최종 합본 — 측면들을 한 줄기로" },
];

const FACET_SIGNAL_RE = /비교|vs\b|장단점|사례|설계|전략|아키텍처|보안|성능|트레이드오프|대안|구조|평가/gi;

/** 주제 무게 → 인원(4~16). 단어 수 + "비교/설계/보안…" 신호에 비례. */
export function recommendSwarmSize(topic: string, min = 4, max = 16): number {
  const trimmed = topic.trim();
  if (!trimmed) return min;
  const words = trimmed.split(/\s+/).filter(Boolean).length;
  const signals = (trimmed.match(FACET_SIGNAL_RE) ?? []).length;
  return Math.max(min, Math.min(max, min + Math.floor(words / 6) + signals * 2));
}

export function planConversationSwarm(input: {
  topic: string;
  minAgents?: number;
  maxAgents?: number;
}): ConversationSwarmPlan {
  const topic = input.topic.trim();
  const count = recommendSwarmSize(topic, input.minAgents ?? 4, input.maxAgents ?? 16);
  const drafts: SwarmDraft[] = Array.from({ length: count }, (_, index) => {
    const slot = RESEARCH_ROSTER[index % RESEARCH_ROSTER.length]!;
    const persona = PERSONA_CODEX.find((entry) => entry.role === slot.role);
    const cycle = Math.floor(index / RESEARCH_ROSTER.length);
    return {
      personaName: persona?.personaName ?? slot.role,
      displayName: persona?.displayName ?? slot.role,
      role: slot.role,
      task: topic ? `「${topic}」 ${slot.facet}${cycle > 0 ? ` (#${cycle + 1})` : ""}` : slot.facet,
    };
  });
  return { topic, drafts, count };
}
