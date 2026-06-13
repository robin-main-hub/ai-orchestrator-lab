import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { WorkbenchAgent } from "../../types";
import { Composer } from "./Composer";

const agent: WorkbenchAgent = {
  id: "agent_orchestrator",
  enabled: true,
  kind: "virtual",
  name: "Orchestrator",
  role: "orchestrator",
  modelId: "mimo-v2.5-pro",
  providerProfileId: "provider_mimo_token_openai",
  configSource: "internal",
  soulMode: "summary",
};

function renderComposer(overrides: Partial<Parameters<typeof Composer>[0]> = {}) {
  return renderToStaticMarkup(
    <Composer
      attachmentAccept="image/*"
      attachmentEnabled
      attachmentLimitReached={false}
      draftAttachments={[]}
      draftMessage=""
      maxDraftAttachments={4}
      onAddDraftAttachments={() => {}}
      onDraftMessageChange={() => {}}
      onRemoveDraftAttachment={() => {}}
      onSendMessage={() => {}}
      selectedAgent={agent}
      showDelegationChips={false}
      {...overrides}
    />,
  );
}

describe("Composer — OpenCode 메커니즘", () => {
  it("플랜/빌드 토글을 렌더하고 현재 모드를 표시한다 (항목 4)", () => {
    const html = renderComposer({ agentMode: "plan", onAgentModeChange: () => {} });
    expect(html).toContain("플랜");
    expect(html).toContain("빌드");
    // plan 탭이 선택 상태
    expect(html).toMatch(/aria-selected="true"[^>]*role="tab"[^>]*title="읽기 전용/);
  });

  it("onAgentModeChange가 없으면 토글을 그리지 않는다", () => {
    const html = renderComposer();
    expect(html).not.toContain("플랜");
  });

  it("턴 진행 중에는 보내기 대신 중지 버튼을 보여준다 (항목 1)", () => {
    const busy = renderComposer({ turnActive: true, onStopTurn: () => {}, draftMessage: "안녕" });
    expect(busy).toContain("중지");
    expect(busy).not.toContain("보내기");

    const idle = renderComposer({ turnActive: false, onStopTurn: () => {}, draftMessage: "안녕" });
    expect(idle).toContain("보내기");
    expect(idle).not.toContain("중지");
  });

  it('onStartSwarmSearch가 있으면 "+" 도구 트리거를 렌더하고, 없으면 안 그린다', () => {
    const withTool = renderComposer({ onStartSwarmSearch: () => {} });
    expect(withTool).toContain('aria-label="도구 추가"');
    const without = renderComposer();
    expect(without).not.toContain('aria-label="도구 추가"');
  });

  it("대기 메시지 큐를 제거 버튼과 함께 렌더한다 (항목 8)", () => {
    const html = renderComposer({
      queuedMessages: ["다음 질문", "그 다음 질문"],
      onRemoveQueuedMessage: () => {},
    });
    expect(html).toContain("대기 1: 다음 질문");
    expect(html).toContain("대기 2: 그 다음 질문");
    expect(html).toContain("대기 메시지 1 제거");
  });
});
