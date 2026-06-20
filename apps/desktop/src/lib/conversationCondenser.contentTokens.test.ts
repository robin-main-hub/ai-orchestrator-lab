import { describe, expect, it } from "vitest";
import { contentTokens } from "./conversationCondenser";

// Characterization tests for contentTokens (no behavior change), the lexical
// tokenizer the existing conversationCondenser.test.ts leaves uncovered. It is
// pure: NFC-normalize → lowercase → split on whitespace/punctuation → drop
// tokens shorter than 2 chars → drop English stopwords → strip a trailing
// Korean josa (only when doing so leaves >=2 chars) → collect into a Set. We
// pin the lowercasing+stopword drop, the punctuation split, the <2-char drop,
// the Set dedup, the josa lemma strip, and the josa-guard (a short token that
// merely looks like a josa is kept intact).

describe("contentTokens", () => {
  it("lowercases and drops English stopwords", () => {
    expect(contentTokens("The quick brown FOX")).toEqual(new Set(["quick", "brown", "fox"]));
  });

  it("splits on punctuation runs", () => {
    expect(contentTokens("alpha,beta;gamma.(delta)")).toEqual(new Set(["alpha", "beta", "gamma", "delta"]));
  });

  it("drops tokens shorter than two characters (incl. single-letter stopwords)", () => {
    expect(contentTokens("I go to it x")).toEqual(new Set(["go"]));
  });

  it("dedupes repeated tokens via the Set return", () => {
    expect(contentTokens("echo Echo ECHO")).toEqual(new Set(["echo"]));
  });

  it("strips a trailing Korean josa to its lemma when long enough", () => {
    expect(contentTokens("데이터를 분석")).toEqual(new Set(["데이터", "분석"]));
  });

  it("keeps a short josa-looking token intact (guard: strip must leave >=2 chars)", () => {
    expect(contentTokens("에서")).toEqual(new Set(["에서"]));
  });
});
