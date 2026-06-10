/**
 * 패치 P1 (MTRAG-UN, arXiv 2602.23184) — 비독립 질문 쿼리 재작성 + scope 토큰 정화.
 *
 * 우리 recall은 순수 lexical인데 (a) recall 쿼리에 agent:/session:/provider: scope
 * 토큰이 섞여 점수를 오염시키고, (b) 한국어 대명사 follow-up("걔가 그거 언제 한댔지?")은
 * 엔티티가 없어 아무것도 못 찾는다. MTRAG-UN은 비독립 질문이 멀티턴의 45.7%이고
 * 재작성이 recall을 R@5 0.39→0.52로 올렸다고 보고. 이 모듈은 순수 1단계(LLM 불필요):
 * scope 토큰 제거 + 비독립성 기계 탐지 + 최근 턴에서 엔티티/키워드 보강.
 */

const SCOPE_TOKEN_RE = /^(?:agent|session|provider):.*$/gim;

/** recall 쿼리에서 scope 토큰 라인 제거 (lexical 오염 방지) */
export function stripScopeTokens(query: string): string {
  return query
    .replace(SCOPE_TOKEN_RE, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

// 한국어/영어 대명사·지시어 — 이게 있으면 직전 맥락을 가리키는 비독립 질문일 가능성
const DEIXIS = [
  "그거", "그것", "그게", "걔", "그분", "그사람", "그 사람", "이거", "이것", "저거",
  "거기", "저기", "그때", "아까", "방금", "위에서", "그건", "이건",
  "it", "that", "this", "they", "them", "he", "she", "there", "those", "these",
];

const KO_JOSA_TRIM = /(?:으로서|으로써|에게서|한테서|께서|에서|에게|한테|으로|이라고|라고|까지|부터|마저|조차|이나|처럼|보다|와|과|을|를|이|가|은|는|에|의|도|만|로)$/u;

function tokens(text: string): string[] {
  return text
    .normalize("NFC")
    .toLowerCase()
    .split(/[\s,.;:!?()[\]{}"'`/\\|<>~\-—·\n]+/u)
    .filter(Boolean);
}

/** 내용어(조사 제거, 2자 이상) */
export function contentWords(text: string): string[] {
  const out: string[] = [];
  for (const token of tokens(text)) {
    const lemma = token.replace(KO_JOSA_TRIM, "");
    if (lemma.length >= 2) out.push(lemma);
  }
  return out;
}

/**
 * 질문이 비독립적인가? (직전 맥락 없이는 검색 불가)
 * - 대명사/지시어를 포함하거나
 * - 내용어가 적고(<3) 고유명사 같은 엔티티가 없을 때
 */
export function isNonStandalone(turn: string): boolean {
  const lower = turn.normalize("NFC").toLowerCase();
  if (DEIXIS.some((deixis) => lower.includes(deixis))) return true;
  const words = contentWords(turn);
  const hasEntity = /[A-Z][a-zA-Z]+|[가-힣]{2,}(?:님|씨|화|봇)/.test(turn);
  return words.length < 3 && !hasEntity;
}

/** 최근 턴들에서 엔티티/키워드 추출 (보강용) */
export function keywordsFromTurns(recentTurns: ReadonlyArray<string>, max = 6): string[] {
  const counts = new Map<string, number>();
  for (const turn of recentTurns) {
    for (const word of contentWords(turn)) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, max)
    .map(([word]) => word);
}

export type RewriteResult = {
  query: string;
  /** 비독립 질문으로 판단해 보강했는지 */
  augmented: boolean;
  /** 추가된 키워드 */
  addedKeywords: string[];
};

/**
 * recall 쿼리 재작성(순수): scope 토큰 제거 → 비독립이면 최근 턴 키워드 보강.
 * recentTurns는 최신순/시간순 무관(키워드만 뽑음), 보통 직전 2~3턴.
 */
export function rewriteRecallQuery(input: {
  rawQuery: string;
  recentTurns?: ReadonlyArray<string>;
}): RewriteResult {
  const cleaned = stripScopeTokens(input.rawQuery);
  const lastTurn = (input.recentTurns?.[input.recentTurns.length - 1] ?? cleaned).trim();
  if (!isNonStandalone(lastTurn) || !input.recentTurns || input.recentTurns.length < 2) {
    return { query: cleaned, augmented: false, addedKeywords: [] };
  }
  // 마지막 턴 제외한 직전 맥락에서 키워드
  const context = input.recentTurns.slice(0, -1);
  const existing = new Set(contentWords(cleaned));
  const added = keywordsFromTurns(context).filter((word) => !existing.has(word));
  if (added.length === 0) return { query: cleaned, augmented: false, addedKeywords: [] };
  return {
    query: `${cleaned}\n${added.join(" ")}`.trim(),
    augmented: true,
    addedKeywords: added,
  };
}
