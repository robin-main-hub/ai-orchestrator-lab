import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AssistantDraft, WorkItem, WorkItemHandoff } from "@ai-orchestrator/protocol";
import { createExternalIngressDemoInput, createStage8IngressSnapshot } from "../runtime/stage8Ingress";
import { HumanPeekPanel } from "./HumanPeekPanel";
import { WorkItemHandoffPanel } from "./WorkItemHandoffPanel";

const workItem: WorkItem = {
  createdAt: "2026-06-05T08:00:00.000Z",
  evidenceRefs: [],
  id: "work_1",
  kind: "internal_coord",
  lane: "check",
  missingInfo: [],
  priority: "high",
  sessionId: "session_desktop_001",
  sourceRefs: [],
  status: "captured",
  summary: "보조 라벨 정리",
  surface: "conversation",
  title: "라벨 확인",
};

const draft: AssistantDraft = {
  body: "운영자 확인용 초안",
  confidence: "medium",
  createdAt: "2026-06-05T08:00:00.000Z",
  evidenceRefs: [],
  id: "draft_1",
  missingInfo: [],
  sessionId: "session_desktop_001",
  status: "draft",
  targetSurface: "conversation",
  title: "초안",
  workItemId: "work_1",
};

const handoff: WorkItemHandoff = {
  approvalState: "required",
  createdAt: "2026-06-05T08:00:00.000Z",
  evidenceRefs: [],
  id: "handoff_1",
  missingInfo: [],
  summary: "실행 슬롯으로 인계",
  targetSurface: "execution_slot",
  workItemId: "work_1",
};

describe("work queue and ingress labels", () => {
  it("uses Korean labels in the WorkItem handoff board", () => {
    const html = renderToStaticMarkup(
      <WorkItemHandoffPanel
        drafts={[draft]}
        handoffs={[handoff]}
        items={[workItem]}
        onArchiveItem={vi.fn()}
        onApproveHandoff={vi.fn()}
        onRouteItem={vi.fn()}
        onSendDraft={vi.fn()}
      />,
    );

    expect(html).toContain("작업 대기열");
    expect(html).toContain("작업");
    expect(html).toContain("초안");
    expect(html).toContain("승인");
    expect(html).toContain("높음");
    expect(html).toContain("승인으로");
    expect(html).toContain("보관");
    expect(html).not.toContain("Control Queue");
    expect(html).not.toContain("tasks");
    expect(html).not.toContain("drafts");
    expect(html).not.toContain("questions pending");
    expect(html).not.toContain("No waiting item");
    expect(html).not.toContain("Check");
    expect(html).not.toContain("Archive");
  });

  it("uses Korean labels in the human ingress peek panel", () => {
    const snapshot = createStage8IngressSnapshot({
      ...createExternalIngressDemoInput("2026-06-06T00:00:00.000Z"),
      channel: "api",
    });
    const html = renderToStaticMarkup(<HumanPeekPanel ingressSnapshot={snapshot} />);

    expect(html).toContain("외부 유입 확인");
    expect(html).toContain("인입 보호");
    expect(html).toContain("상태 요약");
    expect(html).toContain("0토큰 안전 크론");
    expect(html).toContain("활성");
    expect(html).not.toContain("Human Peek");
    expect(html).not.toContain("Ingress Guard");
    expect(html).not.toContain("Status summary");
    expect(html).not.toContain("0-Token Safety");
    expect(html).not.toContain("Active");
  });
});
