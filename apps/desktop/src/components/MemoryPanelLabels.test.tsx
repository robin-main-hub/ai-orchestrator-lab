import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CodingPacket, ConversationMessage, EventEnvelope, MemoryRecord } from "@ai-orchestrator/protocol";
import { createStage6MemoryInspector } from "../runtime/stage6Memory";
import {
  EvolveMementoPanel,
  MEMORY_PANEL_LABELS,
  mementoActionLabel,
  mementoIssueRecommendationLabel,
  mementoRelationKindLabel,
  mementoSeverityLabel,
  mementoTrustLevelLabel,
} from "./EvolveMementoPanel";

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

  it("maps manager action, relation, severity, trust, and recommendation labels to Korean", () => {
    expect(mementoActionLabel("pin")).toBe("고정");
    expect(mementoActionLabel("activate")).toBe("활성화");
    expect(mementoActionLabel("forget")).toBe("삭제");
    expect(mementoRelationKindLabel("supports")).toBe("지지");
    expect(mementoRelationKindLabel("contradicts")).toBe("모순");
    expect(mementoSeverityLabel("high")).toBe("높음");
    expect(mementoTrustLevelLabel("trusted")).toBe("신뢰됨");
    expect(mementoIssueRecommendationLabel("Merge these fragments or keep the newer one as the authoritative memory.")).toBe(
      "중복 조각을 병합하거나 더 최신 항목을 기준 기억으로 유지하세요.",
    );
    expect(mementoIssueRecommendationLabel("Review which memory should win before automatic recall uses both.")).toBe(
      "자동 기억 조회가 두 항목을 함께 쓰기 전에 어떤 기억을 우선할지 검토하세요.",
    );
    expect(mementoIssueRecommendationLabel("Demote, redact, or re-verify this memory before sending it to strong or remote models.")).toBe(
      "강한 모델이나 원격 모델에 보내기 전에 이 기억을 낮추거나 마스킹하거나 다시 검증하세요.",
    );
    expect(mementoIssueRecommendationLabel("Refresh this old memory or let the curator archive it.")).toBe(
      "오래된 기억을 새로 확인하거나 큐레이터가 보관하도록 두세요.",
    );
  });

  it("keeps recall trace tooltip metadata labels Korean", () => {
    const records: MemoryRecord[] = [
      {
        activationState: "active",
        content: "마키마가 기억 패널의 작업 주제와 도구 호출 맥락을 유지합니다.",
        createdAt: "2026-06-06T00:00:00.000Z",
        entities: ["EvolveMemento"],
        entityReinforcement: 1.2,
        id: "memory_tooltip_labels",
        importance: 0.86,
        keywords: ["도구 호출"],
        kind: "context",
        layer: "project_memory",
        persons: ["마키마"],
        pinned: true,
        scope: "project",
        sourceChannel: "desktop",
        title: "기억 패널 툴팁",
        topic: "작업 주제",
        trustLevel: "trusted",
      },
    ];
    const inspector = createStage6MemoryInspector({
      events,
      messages,
      packet,
      records,
    });
    const inspectorWithFusion = {
      ...inspector,
      trace: {
        ...inspector.trace,
        results: inspector.trace.results.map((result) => ({
          ...result,
          fusionDetail: {
            fusionMode: "rrf" as const,
            views: [
              {
                rank: 1,
                rawScore: 1.25,
                view: "lexical" as const,
              },
            ],
          },
        })),
      },
    };

    const html = renderToStaticMarkup(
      <EvolveMementoPanel
        adapterStatus="ready"
        inspector={inspectorWithFusion}
        onActivate={vi.fn()}
        onForget={vi.fn()}
        onPin={vi.fn()}
        onRemember={vi.fn()}
      />,
    );

    expect(html).toContain("중요도 85%");
    expect(html).toContain("주제: 작업 주제");
    expect(html).toContain("인물: 마키마");
    expect(html).toContain("개체: EvolveMemento");
    expect(html).toContain("키워드: 도구 호출");
    expect(html).toContain("융합 방식:");
    expect(html).toContain("순위 #");
    expect(html).not.toContain("importance ");
    expect(html).not.toContain("topic:");
    expect(html).not.toContain("person:");
    expect(html).not.toContain("entity:");
    expect(html).not.toContain("keyword:");
    expect(html).not.toContain("fusion mode:");
    expect(html).not.toContain("(raw ");
  });
});
