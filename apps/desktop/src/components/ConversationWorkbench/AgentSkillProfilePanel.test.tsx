import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentSkillProfilePanel } from "./AgentSkillProfilePanel";

describe("AgentSkillProfilePanel", () => {
  it("선택된 에이전트의 전체 스킬과 권한 경계를 표시한다", () => {
    const html = renderToStaticMarkup(<AgentSkillProfilePanel role="executor" />);

    expect(html).toContain("설치된 스킬/도구");
    expect(html).toContain("실행 도구");
    expect(html).toContain("승인 필요 2개");
    expect(html).toContain("Tmux 전달");
    expect(html).toContain("승인 확인");
    expect(html).toContain("실행 기록");
  });
});
