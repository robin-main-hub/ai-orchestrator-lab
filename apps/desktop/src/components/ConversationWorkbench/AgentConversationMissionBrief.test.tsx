import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentConversationMissionBrief } from "./AgentConversationMissionBrief";

describe("AgentConversationMissionBrief", () => {
  it("선택 에이전트의 대화 준비 상태와 다음 제안을 압축해서 보여준다", () => {
    const html = renderToStaticMarkup(
      <AgentConversationMissionBrief
        continuityDetail="마키마와 이어온 대화 12개, 기억 8건을 참고합니다."
        memoryQualityLabel="기억 좋음"
        modelLabel="대화 모델 · Claude 4.8"
        nextPrompt="지금 막힌 테스트부터 정리해줘"
        personaAppliedLabel="SOUL/AGENTS 적용"
        selectedAgentName="마키마"
        toolLabels={["코드 읽기", "테스트", "승인 요청"]}
        workStatusLabel="검증 중"
      />,
    );

    expect(html).toContain("대화 작전 브리프");
    expect(html).toContain("마키마");
    expect(html).toContain("검증 중");
    expect(html).toContain("Claude 4.8");
    expect(html).toContain("기억 좋음");
    expect(html).toContain("SOUL/AGENTS 적용");
    expect(html).toContain("코드 읽기");
    expect(html).toContain("지금 막힌 테스트부터 정리해줘");
    expect(html).toContain("모델 선택");
    expect(html).toContain("기억 설정");
    expect(html).toContain("인격 수정");
    expect(html).toContain("초안 적용");
    expect(html).not.toContain("Orchestrator");
  });
});
