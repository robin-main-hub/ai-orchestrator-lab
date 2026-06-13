import { describe, expect, it } from "vitest";
import type { GithubPullRequestDetail } from "@ai-orchestrator/protocol";
import { attachmentFromObservedResult } from "./githubContext";
import { assembleCodingRequestMessages, buildGithubContextTracePayload } from "./codingRequestAssembly";
import { codingInjectionBudgets } from "./contextBudget";

/**
 * D2.5 end-to-end smoke — proves the FULL chain the CodingWorkbench attach
 * handler uses: a server fetch result → the observed gate
 * (attachmentFromObservedResult) → the real request assembly
 * (assembleCodingRequestMessages). Closes the one remaining criterion: a PR is
 * attached + injected ONLY when the re-read was genuinely `observed`, never
 * otherwise; the first request carries it; later tool rounds do not repeat it;
 * the model budget governs it; and the trace stays redacted.
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
    body: `SECRETBODY_${n} ` + "Z".repeat(bodyLen),
    baseRef: "main",
    headRef: `feat-${n}`,
    merged: false,
    additions: 1,
    deletions: 1,
    changedFiles: 1,
    commits: 1,
  };
}

type FetchResult = { outcome: string; data?: GithubPullRequestDetail; observedAt?: string; message?: string };

/** mirrors the CodingWorkbench attach handler + first-request injection */
function attachAndInject(result: FetchResult, model: { contextWindow?: number } | undefined) {
  const { totalCharBudget, prExcerptCharBudget } = codingInjectionBudgets(model);
  const attachment = attachmentFromObservedResult(result, "o/r", {
    fallbackObservedAt: "2026-06-14T00:00:00.000Z",
    maxExcerptChars: prExcerptCharBudget,
  });
  if (!attachment) return { attachment: null, block: "" };
  const out = assembleCodingRequestMessages({
    messages: [{ role: "user", content: "이 PR 의도대로 고쳐줘" }],
    requestSeq: 1,
    githubContext: [attachment],
    githubContextOpts: { maxChars: totalCharBudget },
  });
  const block = out
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .find((c) => c.includes("GitHub 컨텍스트")) ?? "";
  return { attachment, block };
}

describe("D2.5 end-to-end — observed attach → 첫 provider request 주입", () => {
  it("observed 결과만 attach되고 첫 요청에 GitHub 컨텍스트가 들어간다", () => {
    const observed: FetchResult = { outcome: "observed", data: prDetail(42, 200), observedAt: "2026-06-14T09:00:00.000Z" };
    const { attachment, block } = attachAndInject(observed, undefined);
    expect(attachment).not.toBeNull();
    expect(attachment!.truthStatus).toBe("observed");
    expect(attachment!.observedAt).toBe("2026-06-14T09:00:00.000Z"); // 서버 응답의 observedAt 보존
    expect(block).toContain("#42");
    expect(block).toContain("사용자가 명시적으로 선택해 첨부한 GitHub 컨텍스트");
  });

  it("non-observed(권한부족/연결실패/미설정/오류)는 attach도 주입도 없다", () => {
    for (const outcome of ["permission_denied", "connection_failed", "not_configured", "github_error"]) {
      const { attachment, block } = attachAndInject({ outcome, message: "x" }, undefined);
      expect(attachment).toBeNull();
      expect(block).toBe("");
    }
    // outcome=observed인데 data가 없는 비정상 응답도 거부(가짜 observed 차단)
    expect(attachmentFromObservedResult({ outcome: "observed" }, "o/r", { fallbackObservedAt: "fb" })).toBeNull();
  });

  it("두 번째 tool 라운드에는 attach된 컨텍스트가 반복 주입되지 않는다", () => {
    const attachment = attachmentFromObservedResult(
      { outcome: "observed", data: prDetail(7, 200), observedAt: "t" },
      "o/r",
      { fallbackObservedAt: "fb" },
    )!;
    const out = assembleCodingRequestMessages({
      messages: [{ role: "user", content: "q" }, { role: "assistant", content: "tool…" }],
      requestSeq: 2,
      githubContext: [attachment],
    });
    expect(out.map((m) => m.content).join("\n")).not.toContain("GitHub 컨텍스트");
  });

  it("attach된 항목의 trace payload엔 본문/토큰/헤더가 없다", () => {
    const attachment = attachmentFromObservedResult(
      { outcome: "observed", data: prDetail(9, 5000), observedAt: "t" },
      "o/r",
      { fallbackObservedAt: "fb", maxExcerptChars: 24_000 },
    )!;
    const payload = JSON.stringify(buildGithubContextTracePayload(attachment));
    expect(payload).not.toContain("SECRETBODY_9"); // 본문 발췌 미포함
    expect(payload.toLowerCase()).not.toContain("authorization");
    expect(payload.toLowerCase()).not.toContain("token");
  });

  it("모델 예산이 attach 발췌 + 주입에 반영된다(작은 모델은 잘림)", () => {
    const { attachment, block } = attachAndInject(
      { outcome: "observed", data: prDetail(1, 20_000), observedAt: "t" },
      { contextWindow: 8_000 },
    );
    expect(attachment!.truncated).toBe(true); // 작은 예산 → 발췌 잘림
    expect(block).toContain("본문 일부 — 원본이 더 김");
  });
});
