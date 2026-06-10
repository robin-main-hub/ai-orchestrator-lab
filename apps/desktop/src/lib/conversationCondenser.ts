/**
 * MT-OSC 대화 응축기 (arXiv 2604.08782 적용).
 *
 * 멀티턴 대화가 길어질 때 토큰을 태우지 않으면서 핵심 정보를 보존하는 순수 코어.
 * 논문의 두 부품을 LLM 없이 구현한다:
 *  - Decider: 응축할지 말지 결정하는 규칙 게이트(어시스턴트 발언 중복도 × 사용자 토큰량).
 *    정보 밀집 대화(리파인먼트 아크)는 응축을 보류해 반복 참조 정보를 지킨다.
 *  - Condenser: 사용자 측은 거의 verbatim, 어시스턴트 측은 핵심 정보 클래스만 추출.
 *    (결정/파일경로/에러/숫자/엔티티/사용자지시/정정·부정 — 페르소나 약속 등 확장 가능)
 *
 * 순차 응축: condense(prior ∪ new) 로 이전 응축본을 새 턴과 함께 다시 응축해
 * 페르소나별 기억 성장을 영구히 bound한다. LLM 백엔드는 이후 교체 가능(인터페이스).
 */

export type CondenserTurn = {
  id?: string;
  role: "user" | "assistant";
  text: string;
};

export type CondensedPair = {
  /** 사용자 입력 — 거의 verbatim */
  humanInput: string;
  /** 어시스턴트 응답 — 핵심만 추출 */
  assistant: string;
  /** 이 쌍에서 보존한 정보 클래스 요약(감사 추적용) */
  reasoning: string;
};

export type Condensate = {
  pairs: CondensedPair[];
  tokenEstimate: number;
  version: number;
};

export type CondenserConfig = {
  /** 어시스턴트 발언 중복도 임계 (이상이면 보류) */
  gamma: number;
  /** 윈도 내 사용자 토큰 임계 (이상이면 보류) */
  tau: number;
  /** 응축 단위 윈도 (턴 쌍 개수) */
  windowSize: number;
  /** 응축본 토큰 상한 */
  condensateBudgetTokens: number;
  /** 사용자 입력 verbatim 보존 상한(자) */
  userVerbatimCapChars: number;
};

export const DEFAULT_CONDENSER_CONFIG: CondenserConfig = {
  gamma: 0.2,
  tau: 1000,
  windowSize: 4,
  condensateBudgetTokens: 1200,
  userVerbatimCapChars: 480,
};

/** lorebook과 동일 관행: 대략 chars/4 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ── 텍스트 정규화 + 한국어 조사 lemmatization-lite ──

const KO_JOSA = [
  "으로서",
  "으로써",
  "에게서",
  "한테서",
  "께서",
  "에서",
  "에게",
  "한테",
  "으로",
  "이라고",
  "라고",
  "이며",
  "까지",
  "부터",
  "마저",
  "조차",
  "이나",
  "처럼",
  "보다",
  "와",
  "과",
  "을",
  "를",
  "이",
  "가",
  "은",
  "는",
  "에",
  "의",
  "도",
  "만",
  "로",
];

const EN_STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "be", "to", "of", "in", "on",
  "for", "with", "as", "at", "by", "it", "this", "that", "i", "you", "we", "they", "he", "she",
]);

function stripJosa(token: string): string {
  for (const josa of KO_JOSA) {
    if (token.length > josa.length + 1 && token.endsWith(josa)) {
      return token.slice(0, -josa.length);
    }
  }
  return token;
}

/** 내용어 토큰 집합 (정규화 + 조사 제거 + 불용어 제거) */
export function contentTokens(text: string): Set<string> {
  const normalized = text.normalize("NFC").toLowerCase();
  const raw = normalized.split(/[\s,.;:!?()[\]{}"'`/\\|<>~\-—·]+/u).filter(Boolean);
  const out = new Set<string>();
  for (const token of raw) {
    if (token.length < 2) continue;
    if (EN_STOPWORDS.has(token)) continue;
    const lemma = stripJosa(token);
    if (lemma.length >= 2) out.add(lemma);
  }
  return out;
}

/** 두 텍스트의 정규화 내용어 교집합 비율(Jaccard 아님 — 작은 쪽 기준 overlap) */
export function contentOverlap(a: string, b: string): number {
  const ta = contentTokens(a);
  const tb = contentTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const token of ta) if (tb.has(token)) shared += 1;
  return shared / Math.min(ta.size, tb.size);
}

/** 인접 어시스턴트 발언들의 평균 중복도 */
export function averageAssistantOverlap(assistantTexts: string[]): number {
  if (assistantTexts.length < 2) return 0;
  let sum = 0;
  let count = 0;
  for (let i = 1; i < assistantTexts.length; i += 1) {
    sum += contentOverlap(assistantTexts[i - 1]!, assistantTexts[i]!);
    count += 1;
  }
  return count === 0 ? 0 : sum / count;
}

// ── Decider (규칙 게이트) ──

/**
 * 응축을 보류해야 하는가? (논문 D_w = 1)
 * 어시스턴트 중복도 > gamma AND 사용자 토큰 > tau → 정보 밀집 대화 → 보류.
 */
export function shouldWithholdCondensation(turns: CondenserTurn[], config: CondenserConfig = DEFAULT_CONDENSER_CONFIG): boolean {
  const assistantTexts = turns.filter((turn) => turn.role === "assistant").map((turn) => turn.text);
  const userTokens = turns
    .filter((turn) => turn.role === "user")
    .reduce((sum, turn) => sum + estimateTokens(turn.text), 0);
  const overlap = averageAssistantOverlap(assistantTexts);
  return overlap > config.gamma && userTokens > config.tau;
}

// ── 핵심 정보 클래스 추출기 ──

const FILE_PATH_RE = /(?:[\w.-]+\/)+[\w.-]+\.\w+|[A-Za-z]:\\[\\\w.-]+/g;
const ERROR_RE = /\b(?:Error|Exception|failed|FAIL|Traceback|panic|undefined|cannot|ERR_[A-Z_]+)\b[^\n.]{0,80}/gi;
const NUMBER_RE = /\b\d[\d,.]*\s?(?:%|개|건|명|초|분|시간|일|월|년|px|MB|KB|GB|ms|tokens?)?\b/g;
const DECISION_RE = /[^.\n]*(?:하겠|할게|결정|선택|채택|will |decided|chose|let's|하기로)[^.\n]*/gi;
const PREF_RE = /[^.\n]*(?:항상|절대|반드시|꼭|never|always|must|하지\s?마|하지\s?말|금지)[^.\n]*/gi;
const NEGATION_RE = /[^.\n]*(?:아니|아니라|말고|그게\s?아니|틀렸|잘못|instead|actually|no,|not\b)[^.\n]*/gi;

function firstSentence(text: string): string {
  const match = text.match(/^[^.!?\n]*[.!?]?/u);
  return (match?.[0] ?? text).trim();
}

function dedupePush(out: string[], value: string): void {
  const trimmed = value.trim();
  if (!trimmed) return;
  if (!out.some((existing) => existing === trimmed)) out.push(trimmed);
}

/** 텍스트에서 보존할 핵심 정보 클래스를 뽑아 {facts, classes} 반환 */
export function extractCriticalInfo(text: string): { facts: string[]; classes: string[] } {
  const facts: string[] = [];
  const classes: string[] = [];
  const collectors: Array<[string, RegExp]> = [
    ["path", FILE_PATH_RE],
    ["error", ERROR_RE],
    ["decision", DECISION_RE],
    ["preference", PREF_RE],
    ["correction", NEGATION_RE],
  ];
  for (const [name, re] of collectors) {
    const matches = text.match(re);
    if (matches && matches.length > 0) {
      classes.push(name);
      for (const m of matches.slice(0, 4)) dedupePush(facts, m);
    }
  }
  // 숫자는 별도(짧아서 문장 통째로보다 토큰만)
  const numbers = text.match(NUMBER_RE);
  if (numbers && numbers.some((n) => /\d{2,}|%|개|건/.test(n))) classes.push("number");
  return { facts, classes };
}

// ── Condenser (추출형) ──

function condenseUser(text: string, capChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= capChars) return trimmed;
  // 초과 시: 첫 문장 + 핵심 정보 포함 문장
  const sentences = trimmed.split(/(?<=[.!?\n])/u).map((s) => s.trim()).filter(Boolean);
  const kept: string[] = [];
  if (sentences[0]) kept.push(sentences[0]);
  for (const sentence of sentences.slice(1)) {
    if (extractCriticalInfo(sentence).classes.length > 0) kept.push(sentence);
    if (kept.join(" ").length > capChars) break;
  }
  return kept.join(" ").slice(0, capChars + 80);
}

function condenseAssistant(text: string): { summary: string; classes: string[] } {
  const trimmed = text.trim();
  const { facts, classes } = extractCriticalInfo(trimmed);
  const head = firstSentence(trimmed);
  const kept: string[] = [];
  dedupePush(kept, head);
  for (const fact of facts.slice(0, 3)) dedupePush(kept, fact);
  return { summary: kept.join(" / ").slice(0, 360), classes };
}

/** 윈도(턴 목록)를 user↔assistant 쌍으로 묶음 */
function pairTurns(turns: CondenserTurn[]): Array<{ user: string; assistant: string }> {
  const pairs: Array<{ user: string; assistant: string }> = [];
  let pendingUser: string | null = null;
  for (const turn of turns) {
    if (turn.role === "user") {
      if (pendingUser !== null) pairs.push({ user: pendingUser, assistant: "" });
      pendingUser = turn.text;
    } else {
      pairs.push({ user: pendingUser ?? "", assistant: turn.text });
      pendingUser = null;
    }
  }
  if (pendingUser !== null) pairs.push({ user: pendingUser, assistant: "" });
  return pairs;
}

function condensePairs(turns: CondenserTurn[], config: CondenserConfig): CondensedPair[] {
  return pairTurns(turns).map(({ user, assistant }) => {
    const humanInput = condenseUser(user, config.userVerbatimCapChars);
    const { summary, classes } = condenseAssistant(assistant);
    const reasoning = classes.length > 0 ? `보존: ${classes.join(", ")}` : "요약(핵심 정보 없음)";
    return { humanInput, assistant: summary, reasoning };
  });
}

function condensateTokens(pairs: CondensedPair[]): number {
  return pairs.reduce((sum, pair) => sum + estimateTokens(pair.humanInput) + estimateTokens(pair.assistant), 0);
}

/**
 * 순차 응축: 이전 응축본 + 새 윈도 → 새 응축본.
 * 예산 초과 시 핵심 정보 없는 가장 오래된 쌍부터 버려 성장을 bound한다.
 * Decider가 보류를 권하면 prior를 그대로 돌려준다(호출부가 raw 유지).
 */
export function condense(
  input: { prior?: Condensate | null; window: CondenserTurn[] },
  config: CondenserConfig = DEFAULT_CONDENSER_CONFIG,
): Condensate {
  const priorPairs = input.prior?.pairs ?? [];
  const newPairs = condensePairs(input.window, config);
  let pairs = [...priorPairs, ...newPairs];

  // 예산 초과 시 정보 없는 오래된 쌍부터 제거
  while (condensateTokens(pairs) > config.condensateBudgetTokens && pairs.length > 1) {
    const dropIndex = pairs.findIndex((pair) => pair.reasoning.startsWith("요약"));
    if (dropIndex === -1) {
      pairs = pairs.slice(1); // 다 핵심이면 가장 오래된 것
    } else {
      pairs = [...pairs.slice(0, dropIndex), ...pairs.slice(dropIndex + 1)];
    }
  }

  return {
    pairs,
    tokenEstimate: condensateTokens(pairs),
    version: (input.prior?.version ?? 0) + 1,
  };
}

/** 응축본을 시스템 프롬프트용 텍스트로 렌더 */
export function renderCondensate(condensate: Condensate | null | undefined): string {
  if (!condensate || condensate.pairs.length === 0) return "";
  const lines = condensate.pairs.map(
    (pair, index) => `${index + 1}. 사용자: ${pair.humanInput}${pair.assistant ? `\n   → ${pair.assistant}` : ""}`,
  );
  return `이전 대화 압축 기록 (${condensate.pairs.length}쌍):\n${lines.join("\n")}`;
}
