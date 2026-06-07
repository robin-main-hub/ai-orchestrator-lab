import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ExperienceRoadmapItem } from "../../lib/orchestrationExperienceRoadmap";
import { ExperienceRoadmapCard } from "./ExperienceRoadmapCard";

describe("ExperienceRoadmapCard", () => {
  it("20개 큰 바위 로드맵과 상태 카운트를 보여준다", () => {
    const items: ExperienceRoadmapItem[] = Array.from({ length: 20 }, (_, index) => ({
      detail: `세부 ${index + 1}`,
      id: `rock_${index + 1}`,
      label: index === 0 ? "에이전트별 진짜 대화방" : index === 1 ? "Tmux block log" : `큰 바위 ${index + 1}`,
      source: index === 1 ? "warp" : "linear",
      status: index === 0 ? "live" : index === 1 ? "blocked" : "next",
    }));

    const html = renderToStaticMarkup(<ExperienceRoadmapCard items={items} />);

    expect(html).toContain("20개 큰 바위 로드맵");
    expect(html).toContain("가동 1");
    expect(html).toContain("다음 18");
    expect(html).toContain("막힘 1");
    expect(html).toContain("에이전트별 진짜 대화방");
    expect(html).toContain("Tmux block log");
    expect(html).toContain("#20");
  });
});
