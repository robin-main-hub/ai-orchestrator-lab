import { describe, expect, it } from "vitest";
import {
  classifyInterruptPriority,
  clusterResponses,
  compareTokens,
  detectConsensus,
  shouldInterrupt,
  textSimilarity,
  type ConsensusState,
} from "./debateConsensus";

// compareTokens is the 0-ref tokenization primitive underneath textSimilarity
// (and thus clusterResponses / detectConsensus). The whole Aegean consensus
// signal rides on its normalization rules, yet they are only exercised
// indirectly today. Pin them directly: lowercase, split on non-alnum/hangul,
// drop <2-char tokens, strip stopwords, and the 2-char stem for >=3-char
// tokens that lets 조사-inflected Korean (캐시를 vs 캐시) collapse to the same
// token. Expected sets are derived from the documented rule, not magic.
describe("compareTokens", () => {
  it("the 2-char stem makes a 조사-inflected phrase tokenize identically to its bare form", () => {
    // "캐시를 도입하자" → ["캐시를"→"캐시", "도입하자"→"도입"]; "캐시 도입" → ["캐시","도입"]
    const inflected = compareTokens("캐시를 도입하자");
    expect(inflected).toEqual(new Set(["캐시", "도입"]));
    expect(compareTokens("캐시 도입")).toEqual(inflected);
  });

  it("lowercases and stems English (>=3 chars) to its first two letters", () => {
    expect(compareTokens("Cache")).toEqual(new Set(["ca"]));
    // different surface form, same stem → collapses together
    expect(compareTokens("Caching")).toEqual(compareTokens("Cache"));
  });

  it("drops tokens shorter than 2 chars (incl. a lone digit) and splits on punctuation", () => {
    // "7" is length 1 → dropped; "," and "!" are split boundaries
    expect(compareTokens("7 캐시,도입!")).toEqual(new Set(["캐시", "도입"]));
  });

  it("strips Korean and English stopwords", () => {
    expect(compareTokens("그리고 the 캐시")).toEqual(new Set(["캐시"]));
  });

  it("dedupes via Set when stem + bare form coincide, and returns empty on no usable tokens", () => {
    // "캐시를"→"캐시" and "캐시"→"캐시" collapse to a single entry
    expect(compareTokens("캐시를 캐시")).toEqual(new Set(["캐시"]));
    expect(compareTokens("")).toEqual(new Set());
    expect(compareTokens("!!! ,,,")).toEqual(new Set());
  });
});

describe("textSimilarity", () => {
  it("동일/유사/무관", () => {
    expect(textSimilarity("캐시를 도입하자", "캐시를 도입하자")).toBe(1);
    expect(textSimilarity("캐시를 도입하자", "캐시 도입이 좋겠다")).toBeGreaterThan(0.3);
    expect(textSimilarity("캐시 도입", "완전히 다른 주제 음악")).toBeLessThan(0.2);
  });
});

describe("clusterResponses", () => {
  it("유사 응답을 묶고 큰 클러스터 먼저", () => {
    const clusters = clusterResponses(
      ["캐시를 도입하자", "캐시 도입에 찬성", "데이터베이스를 교체하자"],
      0.3,
    );
    expect(clusters[0]!.members.length).toBe(2); // 캐시 2개
    expect(clusters.length).toBe(2);
  });
});

describe("detectConsensus — Aegean", () => {
  it("다수가 α 미만이면 no_majority", () => {
    const r = detectConsensus({
      responses: ["A안", "B안", "C안"],
      alpha: 2,
      beta: 2,
      similarityThreshold: 0.5,
    });
    expect(r.status).toBe("no_majority");
  });

  it("α 만족하지만 β(안정) 미달이면 pending", () => {
    const r = detectConsensus({
      responses: ["캐시 도입하자", "캐시 도입 찬성", "캐시 넣자"],
      alpha: 2,
      beta: 2,
      similarityThreshold: 0.25,
    });
    expect(r.status).toBe("pending");
    expect(r.next.stability).toBe(1);
  });

  it("같은 다수가 β 라운드 지속되면 consensus", () => {
    const prior: ConsensusState = { majority: "캐시 도입하자", stability: 1 };
    const r = detectConsensus({
      responses: ["캐시 도입하자", "캐시 도입 찬성", "캐시 넣자"],
      alpha: 2,
      beta: 2,
      similarityThreshold: 0.25,
      prior,
    });
    expect(r.status).toBe("consensus");
    expect(r.next.stability).toBe(2);
  });

  it("다수가 뒤집히면 안정 카운터 리셋(overturn)", () => {
    const prior: ConsensusState = { majority: "캐시 도입하자", stability: 1 };
    const r = detectConsensus({
      responses: ["DB 교체하자", "DB 교체 찬성", "데이터베이스 바꾸자"],
      alpha: 2,
      beta: 2,
      similarityThreshold: 0.25,
      prior,
    });
    expect(r.status).toBe("pending");
    expect(r.next.stability).toBe(1); // reset
  });
});

describe("classifyInterruptPriority", () => {
  it("사실 오류/주제 전환은 critical", () => {
    expect(classifyInterruptPriority("그건 사실이 아니야, 정정할게")).toBe("critical");
    expect(classifyInterruptPriority("잠깐, 다른 얘기인데")).toBe("critical");
    expect(classifyInterruptPriority("actually, no — that's wrong")).toBe("critical");
  });
  it("새 근거는 high, 동의는 normal, 그 외 low", () => {
    expect(classifyInterruptPriority("추가 근거가 있어")).toBe("high");
    expect(classifyInterruptPriority("그 의견에 동의해")).toBe("normal");
    expect(classifyInterruptPriority("음 그렇구나")).toBe("low");
  });
});

describe("shouldInterrupt", () => {
  it("critical은 즉시, high는 장발언 중에만", () => {
    expect(shouldInterrupt({ priority: "critical" }, { speakingChars: 10 })).toBe(true);
    expect(shouldInterrupt({ priority: "high" }, { speakingChars: 100 }, 600)).toBe(false);
    expect(shouldInterrupt({ priority: "high" }, { speakingChars: 700 }, 600)).toBe(true);
    expect(shouldInterrupt({ priority: "normal" }, { speakingChars: 999 })).toBe(false);
  });
});

// The happy cases above always pass explicit alpha/beta/threshold and an
// explicit longSpeechChars, and never feed an empty round or an empty-token
// pair. Four default/guard branches stay unpinned: detectConsensus' empty-
// responses early return + its DEFAULT alpha = Math.max(2, ceil(n/2)) (a lone
// voice can never be a majority by default), textSimilarity's empty-set
// semantics (both empty → 1 identity, one empty → 0, all-stopword → empty →
// identity), and shouldInterrupt's DEFAULT 600-char boundary + low-never-
// interrupts. Pin them, self-consistent (derived from the documented rules).
describe("debateConsensus — default params + empty/guard branches", () => {
  it("an empty round is no_majority with a fully reset next state", () => {
    const r = detectConsensus({ responses: [] });
    expect(r.status).toBe("no_majority");
    expect(r.majority).toBeNull();
    expect(r.confidence).toBe(0);
    expect(r.next).toEqual({ majority: null, stability: 0 });
  });

  it("default alpha = Math.max(2, ceil(n/2)): a lone response can never be a majority", () => {
    // n=1 → default alpha = max(2, ceil(0.5)=1) = 2 > 1 → no single voice is consensus
    const lone = detectConsensus({ responses: ["캐시 도입하자"] });
    expect(lone.status).toBe("no_majority");

    // n=4 all clustering at the default 0.5 threshold → default alpha = max(2,2) = 2 met,
    // no prior → stability 1, default beta 2 → pending (not yet consensus)
    const four = detectConsensus({
      responses: ["캐시 도입하자", "캐시 도입 찬성", "캐시 도입하자", "캐시 도입 찬성"],
    });
    expect(four.status).toBe("pending");
    expect(four.confidence).toBe(1); // all four fall in one cluster
    expect(four.next.stability).toBe(1);
  });

  it("textSimilarity empty-set semantics: both-empty → 1, one-empty → 0, all-stopword collapses to identity", () => {
    expect(textSimilarity("", "")).toBe(1); // two empty token sets are trivially identical
    expect(textSimilarity("", "캐시 도입")).toBe(0); // one side empty → zero overlap
    // both sides reduce to the empty set (punctuation / pure stopwords) → treated identical, not 0
    expect(textSimilarity("!!!", "그리고 the")).toBe(1);
  });

  it("shouldInterrupt default longSpeechChars is 600, and low priority never interrupts", () => {
    expect(shouldInterrupt({ priority: "high" }, { speakingChars: 600 })).toBe(true); // boundary, default cap
    expect(shouldInterrupt({ priority: "high" }, { speakingChars: 599 })).toBe(false);
    expect(shouldInterrupt({ priority: "low" }, { speakingChars: 100_000 })).toBe(false);
  });
});
