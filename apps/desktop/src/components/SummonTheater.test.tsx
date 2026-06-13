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
});
