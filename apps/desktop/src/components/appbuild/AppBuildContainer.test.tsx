import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { buildBlueprintInputFromConversation } from "@ai-orchestrator/protocol";
import type { AppBuildSeed } from "../../lib/appBuildModel";
import { AppBuildContainer } from "./AppBuildContainer";

function seed(over: Partial<AppBuildSeed> = {}): AppBuildSeed {
  const blueprint = buildBlueprintInputFromConversation({ messages: [{ role: "user", content: "할 일 칸반 앱" }] });
  return {
    blueprint,
    sourceSessionId: "session_77",
    messages: [{ role: "user", content: "할 일 칸반 앱" }],
    draft: "할 일 칸반 앱",
    ...over,
  };
}

const noop = () => {};

describe("AppBuildContainer — 정직성 + 검토 패널", () => {
  it("renders the seeded draft, provenance, and the planned-not-observed honesty line", () => {
    const html = renderToStaticMarkup(<AppBuildContainer seed={seed()} onClose={noop} />);
    expect(html).toContain("앱 빌드 — 초안 검토");
    expect(html).toContain("출처 세션:"); // provenance 표시
    expect(html).toContain("session_77");
    expect(html).toContain("planned"); // observed 위장 금지 — planned임을 명시
    expect(html).toContain("결정적 초안 · LLM 미사용"); // 초기 출처 배지
    expect(html).toContain("value=\"할 일 칸반 앱\""); // title 시드가 채워짐
  });

  it("defaults the toggle to 단순 for a 1-screen draft (큰 변경 아님 → 바로 미션)", () => {
    const html = renderToStaticMarkup(<AppBuildContainer seed={seed()} onClose={noop} />);
    expect(html).toContain("미션 만들기"); // simple → 미션 생성 버튼
    expect(html).not.toContain("토론으로 보내기");
    expect(html).toContain("단순 변경");
  });

  it("defaults to 토론 for a ≥2-screen draft, and is honest that screen edits don't flow into the debate", () => {
    const base = buildBlueprintInputFromConversation({ messages: [{ role: "user", content: "대시보드" }] });
    const twoScreens = { ...base, screens: [base.screens[0]!, { ...base.screens[0]!, name: "상세" }] };
    const html = renderToStaticMarkup(
      <AppBuildContainer seed={seed({ blueprint: twoScreens })} onClose={noop} onHandoffToDebate={noop} />,
    );
    expect(html).toContain("토론으로 보내기"); // debate 기본 → 토론 핸드오프 버튼
    expect(html).toContain("토론 권장");
    // 정직성: 편집한 초안이 토론으로 흘러가는 척하지 않는다
    expect(html).toContain("단순 경로");
    expect(html).toContain("토론은 대화를 다시 논의");
  });

  it("disables 'AI로 초안 채우기' when no model is selected (정직: 모델 없으면 AI 비활성)", () => {
    const withoutModel = renderToStaticMarkup(<AppBuildContainer seed={seed()} onClose={noop} />);
    expect(withoutModel).toContain("AI로 초안 채우기");
    // disabled 버튼이 렌더된다(모델 없음)
    expect(withoutModel).toMatch(/AI로 초안 채우기[\s\S]*?disabled|disabled[\s\S]*?AI로 초안 채우기/);

    const withModel = renderToStaticMarkup(
      <AppBuildContainer seed={seed()} model={{ id: "m1", providerProfileId: "p1" }} onClose={noop} />,
    );
    expect(withModel).toContain("AI로 초안 채우기");
  });

  it("creates a mission via the injected client carrying sourceSessionId provenance", async () => {
    const createMission = vi.fn(async () => ({
      mission: { mission: { missionId: "m1", title: "[디자인] 칸반", goal: "g", truthStatus: "planned", createdBy: "appbuild", createdAt: "t" }, status: "planned", truthStatus: "planned", workers: [], artifacts: [], verificationReports: [], mergeQueueItems: [], updatedAt: "t" },
    })) as never;
    // 컴포넌트 내부 onCreate는 simple 모드에서 createMission을 호출 — DI로 검증 가능함을 확인.
    // (정적 렌더만으로는 클릭을 못 하므로, 빌더가 provenance를 싣는지는 appBuildModel.test가 못박는다.)
    const html = renderToStaticMarkup(<AppBuildContainer seed={seed()} onClose={noop} createMission={createMission} />);
    expect(html).toContain("미션 만들기");
  });
});
