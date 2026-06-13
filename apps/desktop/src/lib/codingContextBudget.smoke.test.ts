import { describe, expect, it } from "vitest";
import type { GithubPullRequestDetail } from "@ai-orchestrator/protocol";
import { codingInjectionBudgets, PROVIDER_MESSAGE_CHAR_CAP } from "./contextBudget";
import { buildPrContextAttachment } from "./githubContext";
import { assembleCodingRequestMessages } from "./codingRequestAssembly";

/**
 * D2.5 (model-aware) smoke — proves the attached GitHub PR context flows into
 * the real coding-request assembly using modelContextCharBudget (NOT a hardcoded
 * 12K), across small / unknown / large models, and that the bounds + truncation
 * + excluded-count behave per budget. Exercises the exact helpers CodingWorkbench
 * calls (codingInjectionBudgets → buildPrContextAttachment → assembleCodingRequestMessages).
 */

function prDetail(n: number, bodyLen: number): GithubPullRequestDetail {
  return {
    number: n,
    title: `PR ${n}`,
    state: "open",
    author: "robin",
    draft: false,
    htmlUrl: `https://github.com/o/r/pull/${n}`,
    createdAt: "c",
    updatedAt: "u",
    body: "Z".repeat(bodyLen),
    baseRef: "main",
    headRef: `feat-${n}`,
    merged: false,
    additions: 1,
    deletions: 1,
    changedFiles: 1,
    commits: 1,
  };
}

function attachmentsFor(model: { contextWindow?: number } | undefined, count: number, bodyLen: number) {
  const { prExcerptCharBudget } = codingInjectionBudgets(model);
  return Array.from({ length: count }, (_, i) =>
    buildPrContextAttachment({ detail: prDetail(i + 1, bodyLen), repoFullName: "o/r", observedAt: "t", maxExcerptChars: prExcerptCharBudget }),
  );
}

function firstRequestGithubBlock(model: { contextWindow?: number } | undefined, count: number, bodyLen: number): string {
  const { totalCharBudget } = codingInjectionBudgets(model);
  const out = assembleCodingRequestMessages({
    messages: [{ role: "user", content: "이 PR 의도대로 고쳐줘" }],
    requestSeq: 1,
    githubContext: attachmentsFor(model, count, bodyLen),
    githubContextOpts: { maxChars: totalCharBudget },
  });
  return out
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .find((c) => c.includes("GitHub 컨텍스트")) ?? "";
}

describe("D2.5 model-aware smoke — 모델 예산이 실제 주입을 지배", () => {
  it("작은 모델: 예산 축소 → PR 발췌 truncation + 일부 제외(excluded count)", () => {
    const small = { contextWindow: 8_000 };
    expect(codingInjectionBudgets(small).totalCharBudget).toBe(8_400);
    const block = firstRequestGithubBlock(small, 3, 12_000);
    expect(block).toContain("본문 일부 — 원본이 더 김"); // 본문이 예산보다 길어 잘림
    expect(block).toContain("3개 중"); // 길이 한도로 일부 PR 제외
  });

  it("미상 모델: default 48K → 세 PR 모두 잘림 없이 포함", () => {
    expect(codingInjectionBudgets(undefined).totalCharBudget).toBe(48_000);
    const block = firstRequestGithubBlock(undefined, 3, 12_000);
    expect(block).toContain("PR 1");
    expect(block).toContain("PR 2");
    expect(block).toContain("PR 3");
    expect(block).not.toContain("본문 일부 — 원본이 더 김");
    expect(block).not.toContain("개만"); // 제외 없음
  });

  it("큰 모델: 넉넉한 예산(단 provider 200K 미만) → 전체 포함", () => {
    const large = { contextWindow: 200_000 };
    const budget = codingInjectionBudgets(large).totalCharBudget;
    expect(budget).toBeGreaterThan(48_000);
    expect(budget).toBeLessThan(PROVIDER_MESSAGE_CHAR_CAP);
    const block = firstRequestGithubBlock(large, 3, 12_000);
    expect(block).toContain("PR 1");
    expect(block).toContain("PR 3");
    expect(block).not.toContain("본문 일부 — 원본이 더 김");
  });

  it("어느 모델이든 두 번째 tool 라운드에는 GitHub 컨텍스트가 반복되지 않는다", () => {
    const model = { contextWindow: 200_000 };
    const out = assembleCodingRequestMessages({
      messages: [{ role: "user", content: "q" }, { role: "assistant", content: "tool…" }],
      requestSeq: 2,
      githubContext: attachmentsFor(model, 2, 12_000),
      githubContextOpts: { maxChars: codingInjectionBudgets(model).totalCharBudget },
    });
    expect(out.map((m) => m.content).join("\n")).not.toContain("GitHub 컨텍스트");
  });

  it("작은 모델 주입 블록은 예산 규모에 묶여 폭증하지 않는다", () => {
    const small = { contextWindow: 8_000 };
    const block = firstRequestGithubBlock(small, 5, 40_000);
    // 8.4K 예산 + 1개 보장 규칙 → 한 PR(발췌 8K) 수준, 5*40K=200K가 통째로 들어가지 않는다
    expect(block.length).toBeLessThan(20_000);
  });
});
