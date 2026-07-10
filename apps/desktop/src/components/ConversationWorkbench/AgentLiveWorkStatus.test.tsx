import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentLiveWorkStatus } from "./AgentLiveWorkStatus";

describe("AgentLiveWorkStatus", () => {
  it("현재 선택된 에이전트의 작업 단계를 상단 상태 바로 보여준다", () => {
    const html = renderToStaticMarkup(
      <AgentLiveWorkStatus
        displayName="마키마"
        indicator={{
          label: "답변을 함께 다듬는 중",
          narration: "확인 가능한 내용과 다음 행동만 남기며 답변을 정리하고 있습니다.",
          status: "responding",
          steps: [
            { label: "응답 초안 받음", state: "done" },
            { label: "맥락·권한 점검", state: "active" },
            { label: "대화에 남길 요약 정리", state: "pending" },
          ],
        }}
      />,
    );

    expect(html).toContain("마키마가 지금 맡은 일");
    expect(html).toContain("답변을 함께 다듬는 중");
    expect(html).toContain("확인 가능한 내용과 다음 행동만 남기며");
    expect(html).toContain("응답 초안 받음");
    expect(html).toContain("맥락·권한 점검");
    expect(html).toContain("대화에 남길 요약 정리");
    expect(html).not.toContain("cyan");
    expect(html).not.toContain("emerald");
    expect(html).toContain("primary");
    expect(html).toContain("warning");
  });
});
