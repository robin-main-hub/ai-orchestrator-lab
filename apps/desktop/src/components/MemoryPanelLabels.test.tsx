import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CodingPacket, ConversationMessage, EventEnvelope } from "@ai-orchestrator/protocol";
import { createStage6MemoryInspector } from "../runtime/stage6Memory";
import { EvolveMementoPanel, MEMORY_PANEL_LABELS } from "./EvolveMementoPanel";

const packet: CodingPacket = {
  constraints: ["원문 비밀값 저장 금지"],
  context: ["메모리 패널 한국어화"],
  decisions: ["기억 맥락 라벨을 한국어로 표시"],
  filesToInspect: ["apps/desktop/src/components/EvolveMementoPanel.tsx"],
  goal: "기억 패널 라벨 정리",
  implementationPlan: ["패널 라벨 교체", "회귀 테스트 추가"],
  rejectedOptions: ["영어 라벨 유지"],
  reviewerNotes: ["사용자 화면 기준"],
  verificationPlan: ["typecheck", "test"],
};

const messages: ConversationMessage[] = [
  {
    content: "기억 맥락 확인",
    createdAt: "2026-06-06T00:00:00.000Z",
    id: "message_1",
    role: "user",
    sessionId: "session_desktop_001",
  },
];

const events: EventEnvelope[] = [
  {
    createdAt: "2026-06-06T00:00:00.000Z",
    id: "event_1",
    payload: {},
    redacted: false,
    sessionId: "session_desktop_001",
    source: "desktop",
    sourceTrust: "trusted",
    type: "memory.context",
  },
];

describe("memory panel labels", () => {
  it("uses Korean labels for visible memory context stats", () => {
    const inspector = createStage6MemoryInspector({
      events,
      messages,
      packet,
      records: [],
    });

    const html = renderToStaticMarkup(
      <EvolveMementoPanel
        adapterStatus="ready"
        inspector={inspector}
        onActivate={vi.fn()}
        onForget={vi.fn()}
        onPin={vi.fn()}
        onRemember={vi.fn()}
      />,
    );

    expect(html).toContain("기억 맥락");
    expect(html).toContain("활성");
    expect(html).toContain("차단");
    expect(html).toContain("연결");
    expect(html).not.toContain("Memory Context");
    expect(html).not.toContain("active ");
    expect(html).not.toContain("blocked");
    expect(html).not.toContain("links");
  });

  it("keeps hidden manager labels Korean before they are rendered", () => {
    expect(MEMORY_PANEL_LABELS.managerTitle).toBe("EvolveMemento 기억 관리자");
    expect(MEMORY_PANEL_LABELS.scopeFilter).toBe("범위");
    expect(MEMORY_PANEL_LABELS.kindFilter).toBe("종류");
    expect(MEMORY_PANEL_LABELS.pinned).toBe("고정됨");
    expect(MEMORY_PANEL_LABELS.active).toBe("활성");
  });
});
