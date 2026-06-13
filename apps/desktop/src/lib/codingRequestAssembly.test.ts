import { describe, expect, it } from "vitest";
import type { GithubContextAttachment } from "@ai-orchestrator/protocol";
import { assembleCodingRequestMessages, buildGithubContextTracePayload } from "./codingRequestAssembly";

const base = [
  { role: "system" as const, content: "system prompt" },
  { role: "user" as const, content: "이 PR 의도대로 고쳐줘" },
];

const att = (over: Partial<GithubContextAttachment> = {}): GithubContextAttachment => ({
  id: "gh:o/r:pull_request:42",
  kind: "pull_request",
  repoFullName: "o/r",
  number: 42,
  title: "Add preview runner",
  url: "https://github.com/o/r/pull/42",
  observedAt: "2026-06-13T00:00:00.000Z",
  truthStatus: "observed",
  observedExcerpt: "관측된 PR 본문 발췌 내용",
  truncated: false,
  summarySource: "github_observed",
  source: "github_api",
  ...over,
});

describe("D2.5 — attach된 GitHub context가 첫 coding request에만 주입된다", () => {
  it("첫 요청(requestSeq=1)에는 GitHub Context block이 포함된다", () => {
    const out = assembleCodingRequestMessages({ messages: base, requestSeq: 1, githubContext: [att()] });
    const systemBlocks = out.filter((m) => m.role === "system").map((m) => m.content);
    const ghBlock = systemBlocks.find((c) => c.includes("사용자가 명시적으로 선택해 첨부한 GitHub 컨텍스트"));
    expect(ghBlock).toBeTruthy();
    expect(ghBlock).toContain("Add preview runner");
    expect(ghBlock).toContain("관측된 PR 본문 발췌 내용");
    // 원래 user 메시지는 보존
    expect(out.some((m) => m.role === "user" && m.content.includes("고쳐줘"))).toBe(true);
  });

  it("두 번째 tool 라운드(requestSeq=2)에는 GitHub excerpt가 반복되지 않는다", () => {
    const out = assembleCodingRequestMessages({ messages: base, requestSeq: 2, githubContext: [att()] });
    const joined = out.map((m) => m.content).join("\n");
    expect(joined).not.toContain("관측된 PR 본문 발췌 내용");
    expect(joined).not.toContain("사용자가 명시적으로 선택해 첨부한 GitHub 컨텍스트");
  });

  it("첨부가 없으면 메시지를 그대로 둔다(불필요한 시스템 메시지 추가 없음)", () => {
    const out = assembleCodingRequestMessages({ messages: base, requestSeq: 1 });
    expect(out).toEqual(base);
  });

  it("첨부 본문은 첫 요청에 full, 이후 라운드는 followup ref만(둘 다 동시 검증)", () => {
    const first = assembleCodingRequestMessages({
      messages: base,
      requestSeq: 1,
      attachmentFirstContext: "FIRST_ATTACHMENT_BODY",
      attachmentFollowupContext: "FOLLOWUP_REF",
    });
    const second = assembleCodingRequestMessages({
      messages: base,
      requestSeq: 2,
      attachmentFirstContext: "FIRST_ATTACHMENT_BODY",
      attachmentFollowupContext: "FOLLOWUP_REF",
    });
    expect(first.map((m) => m.content).join()).toContain("FIRST_ATTACHMENT_BODY");
    expect(second.map((m) => m.content).join()).not.toContain("FIRST_ATTACHMENT_BODY");
    expect(second.map((m) => m.content).join()).toContain("FOLLOWUP_REF");
  });

  it("maxItems/maxChars 경계와 제외 개수가 첫 요청 주입에 반영된다", () => {
    const many = Array.from({ length: 7 }, (_, i) => att({ id: `gh:o/r:pull_request:${i}`, number: i, observedExcerpt: "x".repeat(50) }));
    const out = assembleCodingRequestMessages({ messages: base, requestSeq: 1, githubContext: many, githubContextOpts: { maxItems: 3 } });
    const ghBlock = out.find((m) => m.role === "system" && m.content.includes("GitHub 컨텍스트"))!.content;
    expect(ghBlock).toContain("7개 중 3개만");
  });
});

describe("D2.5 — trace payload는 redacted (본문/토큰/헤더 없음)", () => {
  it("repo/number/title/url/observedAt만, observedExcerpt는 제외", () => {
    const payload = buildGithubContextTracePayload(att({ observedExcerpt: "민감한 본문 SECRET" }));
    expect(payload.repoFullName).toBe("o/r");
    expect(payload.number).toBe(42);
    expect(payload.observedAt).toBe("2026-06-13T00:00:00.000Z");
    expect(payload.truthStatus).toBe("observed");
    // 본문/토큰/헤더는 절대 포함하지 않는다
    expect(JSON.stringify(payload)).not.toContain("민감한 본문 SECRET");
    expect(Object.keys(payload)).not.toContain("observedExcerpt");
    expect(JSON.stringify(payload).toLowerCase()).not.toContain("authorization");
    expect(JSON.stringify(payload).toLowerCase()).not.toContain("token");
  });
});
