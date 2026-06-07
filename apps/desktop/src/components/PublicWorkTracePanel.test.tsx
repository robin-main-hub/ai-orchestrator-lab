import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PublicWorkTracePanel } from "./PublicWorkTracePanel";
import type { PublicWorkTrace } from "../lib/publicWorkTrace";

describe("PublicWorkTracePanel", () => {
  it("shows a compact overflow marker when a trace group has hidden items", () => {
    const trace: PublicWorkTrace = {
      groups: [
        {
          id: "commands",
          title: "도구 후보",
          items: [
            { id: "tool-1", label: "도구 1", tone: "info", value: "work.queue" },
            { id: "tool-2", label: "도구 2", tone: "info", value: "approval" },
            { id: "tool-3", label: "도구 3", tone: "info", value: "tmux.plan" },
            { id: "tool-4", label: "도구 4", tone: "info", value: "memory.recall" },
            { id: "tool-5", label: "도구 5", tone: "info", value: "receipt.search" },
          ],
        },
      ],
      receipt: {
        label: "에이전트 실행 영수증",
        status: "checkpointed",
        items: [
          { label: "범위", value: "도구" },
          { label: "기준점", value: "session_main" },
          { label: "마스킹", value: "적용됨" },
          { label: "공개 범위", value: "요약 단계만" },
        ],
      },
    };

    const html = renderToStaticMarkup(<PublicWorkTracePanel trace={trace} />);

    expect(html).toContain("+2개 더 있음");
    expect(html).toContain("도구 4: memory.recall");
    expect(html).toContain("도구 5: receipt.search");
  });
});
