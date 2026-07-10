import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SummonTheater } from "./SummonTheater";

describe("SummonTheater", () => {
  it("explains what the page is (누가 어느 단계서 무슨 일을) and shows the stage pipeline", () => {
    const html = renderToStaticMarkup(<SummonTheater agents={[]} cards={[]} events={[]} onOpenAgent={vi.fn()} />);
    expect(html).toContain("작전극장");
    expect(html).toContain("어느 단계"); // page description
    // 6-stage pipeline labels
    expect(html).toContain("分類");
    expect(html).toContain("完了");
  });

  it("shows a per-card stage chip even in the idle demo party", () => {
    const html = renderToStaticMarkup(<SummonTheater agents={[]} cards={[]} events={[]} />);
    // demo party cards carry the '대기' stage state label
    expect(html).toContain("대기");
  });

  it("demo cards (no real agent) are not clickable buttons", () => {
    const html = renderToStaticMarkup(<SummonTheater agents={[]} cards={[]} events={[]} onOpenAgent={vi.fn()} />);
    // codex-party cards have no agentId → no role=button card affordance on them
    expect(html).not.toContain('와 대화 열기"');
  });

  it("live card = 형제 버튼 2개(본문 선택 + 대화 아이콘, 중첩 금지) + 이번 작전 패널 실데이터", () => {
    const agents = [
      { id: "agent_kurumi", role: "verifier", personaName: "kurumi", displayName: "쿠루미" },
    ] as unknown as Parameters<typeof SummonTheater>[0]["agents"];
    const cards = [
      {
        id: "card_1",
        targetAgentId: "agent_kurumi",
        targetAgentName: "쿠루미",
        targetRoleLabel: "qa",
        title: "쿠루미에게 회귀 검토",
        summary: "변경 후 깨질 흐름을 먼저 찾습니다.",
        toolLabel: "",
        toolPreview: [],
        targetSurface: "conversation",
        priority: "normal",
      },
    ] as unknown as Parameters<typeof SummonTheater>[0]["cards"];
    const html = renderToStaticMarkup(
      <SummonTheater agents={agents} cards={cards} events={[]} onOpenAgent={vi.fn()} request="로그인 버그 고쳐줘" />,
    );
    // 본문 선택 버튼 + 대화 아이콘 버튼(형제)
    expect(html).toContain("주인공으로 보기");
    expect(html).toContain("와 대화 열기");
    // 형제 구조: card-body 버튼이 닫힌 뒤 card-talk 버튼이 옴(중첩 아님)
    expect(html).toMatch(/theater-v2__card-body[\s\S]*?<\/button><button[^>]*theater-v2__card-talk/);
    // 이번 작전 패널: 임무 제목 + 지휘자 요청 발췌
    expect(html).toContain("회귀 검토");
    expect(html).toContain("지휘자 요청");
    expect(html).toContain("로그인 버그 고쳐줘");
  });
});
