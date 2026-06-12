/**
 * Persona Covenant (P1-6, KIMI 브리프). 대화가 길어져 응축(compaction)될 때
 * 캐릭터의 정체성·말투·약속이 소실되면 페르소나가 무너진다(persona drift).
 *
 * 이 모듈은 "페르소나를 드러내는 발화"와 "사용자의 페르소나 피드백"을 감지해,
 * 응축기가 그 문장을 요약하지 않고 보존하도록 신호("persona" 클래스)를 준다.
 * 순수 함수라 캐릭터 무관하게 동작하고, 선택적 Covenant(캐릭터별 키워드)로
 * 정밀도를 높인다. 임베딩/LLM 없이 패턴 기반.
 */

export type PersonaCovenant = {
  /** 캐릭터 핵심 특성/가치관 키워드 (소문자, 매칭용) */
  keywords: string[];
  /** 캐치프레이즈/말버릇 (있으면 그 표현이 든 문장을 페르소나 발화로 본다) */
  catchphrases: string[];
};

/** 사용자가 캐릭터의 말투·성격·정체성에 대해 피드백/지시하는 패턴 */
const PERSONA_FEEDBACK_RE =
  /(말투|어조|말버릇|성격|캐릭터|페르소나|너답|네답|당신답|역할|소울|soul|persona|in character|out of character|그렇게 말하지|이렇게 말해|더 .{0,6}하게 (말|얘기|대답)|덜 .{0,6}하게)/i;

/** 어시스턴트가 1인칭으로 정체성/가치관/약속을 표현하는 패턴 */
const PERSONA_EXPRESSION_RE =
  /(나는 .{0,30}(이|다|야|어|해|니까|거든|라고 (믿|생각|봐))|내 (방식|원칙|신념|역할|일은|기준)|난 .{0,20}(안 |못 |절대|항상)|내가 .{0,20}(약속|책임|지킬|맡)|제 (방식|원칙|소임|역할))/;

/** 텍스트가 페르소나 피드백(사용자 측)인가 */
export function detectPersonaFeedback(text: string): boolean {
  return PERSONA_FEEDBACK_RE.test(text);
}

/** 텍스트가 페르소나 발화(어시스턴트 측)인가 — covenant가 있으면 키워드/캐치프레이즈도 본다 */
export function detectPersonaExpression(text: string, covenant?: PersonaCovenant): boolean {
  if (PERSONA_EXPRESSION_RE.test(text)) return true;
  if (covenant) {
    const lower = text.toLowerCase();
    if (covenant.catchphrases.some((cp) => cp && text.includes(cp))) return true;
    // 핵심 특성 키워드가 2개 이상 등장하면 페르소나 색채가 강한 문장으로 본다
    const hits = covenant.keywords.filter((k) => k && lower.includes(k)).length;
    if (hits >= 2) return true;
  }
  return false;
}

/** 한 텍스트(여러 문장)에서 페르소나 신호가 있는지 + 어느 쪽인지 */
export function personaSignal(
  text: string,
  role: "user" | "assistant",
  covenant?: PersonaCovenant,
): boolean {
  return role === "user" ? detectPersonaFeedback(text) : detectPersonaExpression(text, covenant);
}

const STOPWORDS = new Set([
  "그리고", "하지만", "그러나", "그래서", "또한", "the", "and", "for", "with", "you", "your",
  "이것", "그것", "저것", "합니다", "입니다", "있다", "없다", "한다", "된다", "같은", "위해",
]);

/**
 * 페르소나 설정(SOUL.md 요약/금지 스타일/예시 대화)에서 Covenant를 만든다.
 * soulSummary·forbiddenStyle의 의미 있는 토큰을 키워드로, 예시 대화의 짧은
 * 인용구를 캐치프레이즈 후보로 뽑는다.
 */
export function buildCovenantFromPersona(persona?: {
  soulSummary?: string;
  forbiddenStyle?: string;
  soulExampleDialogue?: string;
}): PersonaCovenant {
  if (!persona) return { keywords: [], catchphrases: [] };
  const sourceText = `${persona.soulSummary ?? ""} ${persona.forbiddenStyle ?? ""}`;
  const keywords = Array.from(
    new Set(
      sourceText
        .toLowerCase()
        .split(/[^a-z가-힣0-9]+/i)
        .filter((w) => w.length >= 2 && !STOPWORDS.has(w)),
    ),
  ).slice(0, 40);

  const catchphrases: string[] = [];
  const dialogue = persona.soulExampleDialogue ?? "";
  const cleanPhrase = (p: string) => p.trim().replace(/[.!?。！？,，\s]+$/u, "").trim();
  // 따옴표로 둘러싸인 짧은 발화 또는 느낌표로 끝나는 짧은 문장을 캐치프레이즈 후보로
  for (const m of dialogue.matchAll(/[「"']([^」"'\n]{2,24})[」"']/g)) {
    if (m[1]) catchphrases.push(cleanPhrase(m[1]));
  }
  for (const m of dialogue.matchAll(/([^.!?\n]{2,20}[!？!])/g)) {
    if (m[1]) catchphrases.push(cleanPhrase(m[1]));
  }

  return {
    keywords,
    catchphrases: Array.from(new Set(catchphrases.filter((p) => p.length >= 2))).slice(0, 12),
  };
}
