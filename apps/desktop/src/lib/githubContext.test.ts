import { describe, expect, it } from "vitest";
import type { GithubContextAttachment, GithubPullRequestDetail } from "@ai-orchestrator/protocol";
import {
  buildGithubContextPrompt,
  buildPrContextAttachment,
  isContextAttached,
  prContextKey,
  removeContextAttachment,
  upsertContextAttachment,
} from "./githubContext";

const detail = (over: Partial<GithubPullRequestDetail> = {}): GithubPullRequestDetail => ({
  number: 42,
  title: "Add preview runner",
  state: "open",
  author: "robin",
  draft: false,
  htmlUrl: "https://github.com/o/r/pull/42",
  createdAt: "c",
  updatedAt: "u",
  body: "이 PR은 프리뷰 러너를 추가합니다.",
  baseRef: "main",
  headRef: "feat-preview",
  merged: false,
  additions: 120,
  deletions: 8,
  changedFiles: 5,
  commits: 3,
  ...over,
});

describe("buildPrContextAttachment — 결정적 observed excerpt", () => {
  it("실제 body를 결정적으로 발췌하고 observed/github_observed로 표기", () => {
    const att = buildPrContextAttachment({ detail: detail(), repoFullName: "o/r", observedAt: "2026-06-13T00:00:00.000Z" });
    expect(att.id).toBe(prContextKey("o/r", 42));
    expect(att.truthStatus).toBe("observed");
    expect(att.summarySource).toBe("github_observed");
    expect(att.source).toBe("github_api");
    expect(att.observedExcerpt).toContain("#42 Add preview runner");
    expect(att.observedExcerpt).toContain("main ← feat-preview");
    expect(att.observedExcerpt).toContain("프리뷰 러너를 추가합니다");
    expect(att.truncated).toBe(false);
  });

  it("긴 본문은 잘리고 truncated=true (raw full body 미포함)", () => {
    const big = "x".repeat(20_000);
    const att = buildPrContextAttachment({ detail: detail({ body: big }), repoFullName: "o/r", observedAt: "t", maxExcerptChars: 6000 });
    expect(att.truncated).toBe(true);
    expect(att.observedExcerpt.length).toBeLessThan(big.length);
  });

  it("기본 발췌 한도는 넉넉(24K) — 20K 본문은 잘리지 않는다(과도 클램프 방지)", () => {
    const body = "y".repeat(20_000);
    const att = buildPrContextAttachment({ detail: detail({ body }), repoFullName: "o/r", observedAt: "t" });
    expect(att.truncated).toBe(false);
    expect(att.observedExcerpt).toContain(body);
  });
});

describe("upsert/remove/isContextAttached — idempotent", () => {
  const a = (id: string): GithubContextAttachment => ({
    id,
    kind: "pull_request",
    repoFullName: "o/r",
    number: 1,
    title: "t",
    url: "u",
    observedAt: "t",
    truthStatus: "observed",
    observedExcerpt: "x",
    truncated: false,
    summarySource: "github_observed",
    source: "github_api",
  });

  it("같은 id는 중복되지 않고 교체된다(중복 attach 방지)", () => {
    const first = upsertContextAttachment([], a("k1"));
    const again = upsertContextAttachment(first, { ...a("k1"), observedAt: "t2" });
    expect(again).toHaveLength(1);
    expect(again[0]!.observedAt).toBe("t2");
  });

  it("remove / isContextAttached", () => {
    const list = upsertContextAttachment([], a("k1"));
    expect(isContextAttached(list, "k1")).toBe(true);
    expect(isContextAttached(removeContextAttachment(list, "k1"), "k1")).toBe(false);
    expect(isContextAttached(undefined, "k1")).toBe(false);
  });
});

describe("buildGithubContextPrompt — 경계/정직", () => {
  const make = (id: string, excerpt: string): GithubContextAttachment => ({
    id,
    kind: "pull_request",
    repoFullName: "o/r",
    number: Number(id.slice(1)),
    title: `PR ${id}`,
    url: "u",
    observedAt: "t",
    truthStatus: "observed",
    observedExcerpt: excerpt,
    truncated: false,
    summarySource: "github_observed",
    source: "github_api",
  });

  it("없으면 undefined", () => {
    expect(buildGithubContextPrompt([])).toBeUndefined();
    expect(buildGithubContextPrompt(undefined)).toBeUndefined();
  });

  it("선택 첨부만 근거로 삼으라는 정직 지시 + 내용 포함", () => {
    const prompt = buildGithubContextPrompt([make("p42", "본문 발췌")]);
    expect(prompt).toContain("사용자가 명시적으로 선택해 첨부한 GitHub 컨텍스트");
    expect(prompt).toContain("본문 발췌");
    expect(prompt).toContain("보았다고 가정하지 않습니다");
  });

  it("maxItems를 넘으면 제외 개수를 정직하게 표시", () => {
    const items = Array.from({ length: 7 }, (_, i) => make(`p${i + 1}`, "짧은 본문"));
    const prompt = buildGithubContextPrompt(items, { maxItems: 5 });
    expect(prompt).toContain("7개 중 5개만");
  });

  it("char budget를 넘기면 최소 1개는 포함하되 폭증하지 않는다", () => {
    const items = [make("p1", "a".repeat(9000)), make("p2", "b".repeat(9000))];
    const prompt = buildGithubContextPrompt(items, { maxChars: 12000 })!;
    expect(prompt).toContain("PR p1");
    // 두 번째는 예산 초과로 제외 → 제외 안내
    expect(prompt).toContain("2개 중 1개만");
  });
});
