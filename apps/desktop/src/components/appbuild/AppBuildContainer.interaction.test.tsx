// @vitest-environment jsdom
//
// 클릭 수준 통합 테스트(후속2). 레포는 기본 SSR-only(renderToStaticMarkup)라, 이 파일만
// 파일-스코프 `@vitest-environment jsdom`으로 실제 DOM 상호작용을 검증한다(다른 테스트 무영향).
// AI 보강 success/degraded 흡수, 편집값이 submit payload에 반영, simple/debate 분기, 정직 문구를
// 실제 클릭으로 확인한다.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  buildBlueprintInputFromConversation,
  type ConversationBlueprintDraftRequest,
  type ConversationBlueprintDraftResponse,
  type DesignBlueprintInput,
  type MissionFromBlueprintRequest,
} from "@ai-orchestrator/protocol";
import type { AppBuildSeed } from "../../lib/appBuildModel";
import { AppBuildContainer } from "./AppBuildContainer";

afterEach(cleanup);

function seed(over: Partial<AppBuildSeed> = {}): AppBuildSeed {
  return {
    blueprint: buildBlueprintInputFromConversation({ messages: [{ role: "user", content: "할 일 칸반 앱" }] }),
    sourceSessionId: "session_77",
    messages: [{ role: "user", content: "할 일 칸반 앱" }],
    draft: "할 일 칸반 앱",
    ...over,
  };
}

const aiBlueprint: DesignBlueprintInput = {
  title: "AI 보강 칸반",
  userIntent: "컬럼 관리",
  targetSurface: "new_app",
  screens: [{ name: "보드", purpose: "칸반", primaryAction: "카드 추가", secondaryActions: [], dataNeeded: [], emptyState: "없음", errorState: "실패" }],
  designTokens: { density: "balanced", tone: "clean_builder", motion: "subtle" },
  acceptanceCriteria: [],
};

function missionResponse() {
  return {
    mission: { mission: { missionId: "m1", title: "[디자인] x", goal: "g", truthStatus: "planned", createdBy: "appbuild", createdAt: "t" }, status: "planned", truthStatus: "planned", workers: [], artifacts: [], verificationReports: [], mergeQueueItems: [], updatedAt: "t" },
  } as never;
}

describe("AppBuildContainer 상호작용 (jsdom)", () => {
  it("'AI로 초안 채우기' 성공 → AI 초안 배지(planned), 화면 갱신", async () => {
    const fillDraft = vi.fn(
      async (_input: { request: ConversationBlueprintDraftRequest }): Promise<ConversationBlueprintDraftResponse> => ({ blueprint: aiBlueprint, source: "ai", degraded: false }),
    );
    render(<AppBuildContainer seed={seed()} model={{ id: "m1", providerProfileId: "p1" }} onClose={() => {}} fillDraft={fillDraft} />);
    fireEvent.click(screen.getByRole("button", { name: /AI로 초안 채우기/ }));
    await waitFor(() => expect(fillDraft).toHaveBeenCalledTimes(1)); // 정확히 1콜
    expect(fillDraft.mock.calls[0]![0].request.useAi).toBe(true);
    expect(await screen.findByText(/AI 초안 · draft\(planned\)/)).toBeTruthy();
    expect((screen.getByLabelText("제목") as HTMLInputElement).value).toBe("AI 보강 칸반"); // AI 응답으로 필드 갱신
  });

  it("'AI로 초안 채우기' 실패(degraded) → 'AI 실패' 경고 배지 + 사용자가 편집한 초안 보존(정직)", async () => {
    // degraded 응답은 distinct한 blueprint를 담아도 무시되어야 한다(편집 손실 방지).
    const distinctStub: DesignBlueprintInput = { ...aiBlueprint, title: "이건_무시되어야_함" };
    const fillDraft = vi.fn(
      async (_input: { request: ConversationBlueprintDraftRequest }): Promise<ConversationBlueprintDraftResponse> => ({ blueprint: distinctStub, source: "stub", degraded: true, note: "provider down" }),
    );
    render(<AppBuildContainer seed={seed()} model={{ id: "m1", providerProfileId: "p1" }} onClose={() => {}} fillDraft={fillDraft} />);
    fireEvent.change(screen.getByLabelText("제목"), { target: { value: "내_편집_제목" } });
    fireEvent.click(screen.getByRole("button", { name: /AI로 초안 채우기/ }));
    expect(await screen.findByText(/AI 실패/)).toBeTruthy();
    expect(screen.getByText(/provider down/)).toBeTruthy(); // degrade 사유 노출
    // 편집한 제목이 그대로 — degraded면 서버 stub로 덮어쓰지 않는다
    expect((screen.getByLabelText("제목") as HTMLInputElement).value).toBe("내_편집_제목");
  });

  it("AI 버튼은 모델이 없으면 비활성(정직 — AI 미가용)", () => {
    render(<AppBuildContainer seed={seed()} onClose={() => {}} />);
    expect((screen.getByRole("button", { name: /AI로 초안 채우기/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("title 편집 → '미션 만들기' → createMission이 편집값 + sourceSessionId provenance로 호출", async () => {
    const createMission = vi.fn(async (_input: { request: MissionFromBlueprintRequest }) => missionResponse());
    const onCreated = vi.fn();
    render(<AppBuildContainer seed={seed()} onClose={() => {}} createMission={createMission} onCreated={onCreated} />);
    fireEvent.change(screen.getByLabelText("제목"), { target: { value: "내가 고친 제목" } });
    fireEvent.click(screen.getByRole("button", { name: /미션 만들기/ }));
    await waitFor(() => expect(createMission).toHaveBeenCalledTimes(1));
    const req = createMission.mock.calls[0]![0].request;
    expect(req.blueprint.title).toBe("내가 고친 제목"); // 편집값이 payload에 반영
    expect(req.sourceSessionId).toBe("session_77"); // provenance
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(screen.getByText("미션 생성됨")).toBeTruthy();
  });

  it("debate 모드(≥2화면) → '토론으로 보내기' → 편집 blueprint를 핸드오프 + 닫기", async () => {
    const base = buildBlueprintInputFromConversation({ messages: [{ role: "user", content: "대시보드" }] });
    const twoScreens = { ...base, screens: [base.screens[0]!, { ...base.screens[0]!, name: "상세" }] };
    const onHandoffToDebate = vi.fn((_blueprint: DesignBlueprintInput) => {});
    const onClose = vi.fn();
    const createMission = vi.fn(async (_input: { request: MissionFromBlueprintRequest }) => missionResponse());
    render(<AppBuildContainer seed={seed({ blueprint: twoScreens })} onClose={onClose} onHandoffToDebate={onHandoffToDebate} createMission={createMission} />);
    fireEvent.change(screen.getByLabelText("제목"), { target: { value: "토론용 제목" } });
    fireEvent.click(screen.getByRole("button", { name: /토론으로 보내기/ }));
    expect(onHandoffToDebate).toHaveBeenCalledTimes(1);
    expect(onHandoffToDebate.mock.calls[0]![0].title).toBe("토론용 제목"); // 편집 초안이 실제로 전달
    expect(onClose).toHaveBeenCalled();
    expect(createMission).not.toHaveBeenCalled(); // 토론 분기는 미션 생성 안 함
  });

  it("정직 문구: 초안은 planned이며 observed가 아님을 항상 표기", () => {
    render(<AppBuildContainer seed={seed()} onClose={() => {}} />);
    expect(screen.getByText(/planned/)).toBeTruthy();
    expect(screen.getByText(/observed/)).toBeTruthy(); // "...observed가 됩니다" 안내
  });

  it("NO-AUTO-FIRE: 단순↔토론 토글 선택만으로는 아무 것도 발사하지 않는다(명시적 시작만)", () => {
    const fillDraft = vi.fn(async (_i: { request: ConversationBlueprintDraftRequest }): Promise<ConversationBlueprintDraftResponse> => ({ blueprint: aiBlueprint, source: "ai", degraded: false }));
    const createMission = vi.fn(async (_i: { request: MissionFromBlueprintRequest }) => missionResponse());
    const onHandoffToDebate = vi.fn((_bp: DesignBlueprintInput) => {});
    render(
      <AppBuildContainer seed={seed()} model={{ id: "m1", providerProfileId: "p1" }} onClose={() => {}} fillDraft={fillDraft} createMission={createMission} onHandoffToDebate={onHandoffToDebate} />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /큰 변경 — 토론 먼저/ })); // 모드만 전환
    fireEvent.click(screen.getByRole("tab", { name: /단순 — 바로 미션/ }));
    expect(fillDraft).not.toHaveBeenCalled();
    expect(createMission).not.toHaveBeenCalled();
    expect(onHandoffToDebate).not.toHaveBeenCalled(); // 토글 선택은 엔진/미션/AI를 안 부른다
  });
});
