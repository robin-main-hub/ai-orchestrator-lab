/**
 * Multi-character debate dynamics (P1-7, KIMI 브리프 / 서브컬처 축).
 *
 * 토론이 고정 라운드 수로만 끝나면 (a) 이미 합의됐는데 계속 돌거나 (b) 아직
 * 갈리는데 조기 종료한다. Aegean Protocol을 임베딩 없이 텍스트 유사도로 구현해
 * "의미적 합의"를 감지한다:
 *   - α-similarity: 적어도 α개의 응답이 의미적으로 동등(유사도 ≥ threshold)
 *   - β-stability: 그 다수 의견이 β 연속 라운드 지속
 * 끼어들기(interruption)는 우선순위로 분류해 토론 흐름을 자연스럽게 만든다.
 */

const TOKEN_STOPWORDS = new Set([
  "그리고", "하지만", "그래서", "또한", "그러나", "the", "and", "for", "with",
  "이", "그", "저", "것", "수", "등", "más", "is", "to", "of", "a", "in",
]);

/**
 * 비교용 토큰 집합. 한국어는 조사 변형(캐시를/캐시, 도입하자/도입이)으로 토큰이
 * 어긋나므로, 3글자 이상 토큰은 앞 2글자(어간 근사)로 정규화해 매칭률을 올린다.
 */
export function compareTokens(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .split(/[^a-z가-힣0-9]+/i)
    .filter((w) => w.length >= 2 && !TOKEN_STOPWORDS.has(w));
  return new Set(words.map((w) => (w.length >= 3 ? w.slice(0, 2) : w)));
}

/** Jaccard 유사도 (0~1) */
export function textSimilarity(a: string, b: string): number {
  const ta = compareTokens(a);
  const tb = compareTokens(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / (ta.size + tb.size - inter);
}

export type ResponseCluster = {
  members: number[]; // 응답 인덱스
  representative: string;
};

/** 유사 응답을 그리디로 묶는다 (threshold 이상이면 같은 클러스터) */
export function clusterResponses(responses: string[], threshold = 0.5): ResponseCluster[] {
  const clusters: ResponseCluster[] = [];
  responses.forEach((text, index) => {
    const hit = clusters.find((c) => textSimilarity(c.representative, text) >= threshold);
    if (hit) hit.members.push(index);
    else clusters.push({ members: [index], representative: text });
  });
  return clusters.sort((a, b) => b.members.length - a.members.length);
}

export type ConsensusState = {
  /** 직전까지 다수였던 대표 답변 (없으면 null) */
  majority: string | null;
  /** 연속 안정 라운드 수 */
  stability: number;
};

export type ConsensusResult = {
  status: "consensus" | "pending" | "no_majority";
  majority: string | null;
  confidence: number; // 다수 클러스터 비율 (0~1)
  /** 다음 라운드로 넘길 상태 */
  next: ConsensusState;
};

/**
 * Aegean Protocol 합의 판정. 이번 라운드 응답들과 직전 상태로 합의 여부를 본다.
 *   - 다수 클러스터 크기 < α → no_majority (안정 카운터 리셋)
 *   - 다수 답변이 직전과 유사 → stability++; 아니면 1로 리셋(overturn)
 *   - stability ≥ β → consensus
 */
export function detectConsensus(input: {
  responses: string[];
  alpha?: number;
  beta?: number;
  similarityThreshold?: number;
  prior?: ConsensusState;
}): ConsensusResult {
  const alpha = input.alpha ?? Math.max(2, Math.ceil(input.responses.length / 2));
  const beta = input.beta ?? 2;
  const threshold = input.similarityThreshold ?? 0.5;
  const prior = input.prior ?? { majority: null, stability: 0 };

  if (input.responses.length === 0) {
    return { status: "no_majority", majority: null, confidence: 0, next: { majority: null, stability: 0 } };
  }

  const clusters = clusterResponses(input.responses, threshold);
  const top = clusters[0]!;
  const confidence = top.members.length / input.responses.length;

  if (top.members.length < alpha) {
    return {
      status: "no_majority",
      majority: null,
      confidence,
      next: { majority: null, stability: 0 },
    };
  }

  const sameAsPrior = prior.majority !== null && textSimilarity(prior.majority, top.representative) >= threshold;
  const stability = sameAsPrior ? prior.stability + 1 : 1;
  const next: ConsensusState = { majority: top.representative, stability };

  return {
    status: stability >= beta ? "consensus" : "pending",
    majority: top.representative,
    confidence,
    next,
  };
}

export type InterruptPriority = "critical" | "high" | "normal" | "low";

const INTERRUPT_PATTERNS: Array<{ priority: InterruptPriority; re: RegExp }> = [
  // 사실 오류 정정 · 주제 전환 · 사용자 중단 → 즉시 끼어들기
  {
    priority: "critical",
    re: /(사실이 (아니|틀)|틀렸|오류[가는]|그건 (아니|틀)|정정|잠깐|중단|stop|that'?s wrong|incorrect|actually,? no)/i,
  },
  // 새 근거 · 타임아웃 경고 → 높은 우선
  { priority: "high", re: /(추가 근거|새 (정보|근거)|보충(할|하자)|덧붙이|놓친|new evidence|to add)/i },
  // 동의 신호 · 명확화 요청 → 보통
  { priority: "normal", re: /(동의|찬성|맞아|좋(아|은) 생각|명확히|확인하자|agree|clarif)/i },
];

/** 발화의 끼어들기 우선순위를 분류 (없으면 low) */
export function classifyInterruptPriority(text: string): InterruptPriority {
  for (const { priority, re } of INTERRUPT_PATTERNS) {
    if (re.test(text)) return priority;
  }
  return "low";
}

/** critical은 즉시, high는 장발언(임계 초과) 중일 때만 끼어들기를 허용 */
export function shouldInterrupt(
  pending: { priority: InterruptPriority },
  currentSpeaker: { speakingChars: number },
  longSpeechChars = 600,
): boolean {
  if (pending.priority === "critical") return true;
  if (pending.priority === "high") return currentSpeaker.speakingChars >= longSpeechChars;
  return false;
}
