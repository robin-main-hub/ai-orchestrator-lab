import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "../../lib/codingChat";
import { CodingThread } from "./CodingThread";

const NOW = "2026-06-10T00:00:00.000Z";

describe("CodingThread", () => {
  it("renders the empty-state hints", () => {
    const html = renderToStaticMarkup(<CodingThread messages={[]} />);
    expect(html).toContain("/help");
    expect(html).toContain("승인 게이트");
  });

  it("renders text with code fences, bash output card, and a colored diff card", () => {
    const messages: ChatMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "고쳐줘" }], createdAt: NOW },
      {
        id: "a1",
        role: "assistant",
        createdAt: NOW,
        parts: [
          { type: "text", text: "결과는:\n```\nconst x = 1;\n```\n입니다" },
          {
            type: "tool",
            call: {
              id: "t0",
              tool: "bash",
              title: "pnpm test",
              input: { command: "pnpm test" },
              status: "completed",
              output: "1 passed",
            },
          },
          {
            type: "tool",
            call: {
              id: "t1",
              tool: "edit",
              title: "수정 src/a.ts",
              input: { path: "src/a.ts", diff: "@@ -1 +1 @@\n-old line\n+new line" },
              status: "proposed",
            },
          },
        ],
      },
    ];
    const html = renderToStaticMarkup(<CodingThread messages={messages} onApplyEdit={vi.fn()} thinking />);
    expect(html).toContain("const x = 1;");
    expect(html).toContain("터미널");
    expect(html).toContain("pnpm test");
    // edit card opens by default: diff lines colored + gated apply button
    expect(html).toContain("coding-diff__line--add");
    expect(html).toContain("coding-diff__line--del");
    expect(html).toContain("적용 (게이트 통과)");
    // thinking indicator
    expect(html).toContain("os-thinking-dot");
    // collapsed bash card hides output until expanded
    expect(html).not.toContain("1 passed");
  });

  it("renders todo checklists and denied status", () => {
    const messages: ChatMessage[] = [
      {
        id: "a1",
        role: "assistant",
        createdAt: NOW,
        parts: [
          {
            type: "tool",
            call: {
              id: "t0",
              tool: "todo",
              title: "할 일 목록",
              input: { items: ["테스트 추가", "리팩터"] },
              status: "completed",
            },
          },
          {
            type: "tool",
            call: { id: "t1", tool: "bash", title: "rm -rf /", input: {}, status: "denied" },
          },
        ],
      },
    ];
    const html = renderToStaticMarkup(<CodingThread messages={messages} />);
    expect(html).toContain("테스트 추가");
    expect(html).toContain("거부됨");
  });
});
