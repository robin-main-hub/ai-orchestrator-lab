import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentLiveWorkStatus } from "./AgentLiveWorkStatus";

describe("AgentLiveWorkStatus", () => {
  it("현재 선택된 에이전트의 작업 단계를 상단 상태 바로 보여준다", () => {
    const html = renderToStaticMarkup(
      <AgentLiveWorkStatus
        displayName="마키마"
        indicator={{
          label: "응답 작성 중",
          status: "responding",
          steps: [
            { label: "공급자 호출", state: "done" },
            { label: "마스킹 점검", state: "active" },
            { label: "영수증 저장", state: "pending" },
          ],
        }}
      />,
    );

    expect(html).toContain("마키마 작업 중");
    expect(html).toContain("응답 작성 중");
    expect(html).toContain("공급자 호출");
    expect(html).toContain("마스킹 점검");
    expect(html).toContain("영수증 저장");
    expect(html).not.toContain("cyan");
    expect(html).not.toContain("emerald");
    expect(html).toContain("violet");
    expect(html).toContain("amber");
  });
});
