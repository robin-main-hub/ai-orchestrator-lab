import type { AssistantDraft, WorkItem, WorkItemHandoff } from "@ai-orchestrator/protocol";
import type { AgentChannelAdapterStatus } from "./agentChannelStatus";

export type ControlQueueContinuitySummary = {
  hasItems: boolean;
  label: string;
  latestTitle?: string;
  tone: AgentChannelAdapterStatus;
};

export type ControlQueueContinuityInput = {
  assistantDrafts: AssistantDraft[];
  handoffs: WorkItemHandoff[];
  workItems: WorkItem[];
};

export function createControlQueueContinuitySummary({
  assistantDrafts,
  handoffs,
  workItems,
}: ControlQueueContinuityInput): ControlQueueContinuitySummary {
  const activeAskItems = workItems.filter((item) => item.surface === "conversation" && item.lane === "ask" && item.status !== "done");
  const activeCheckItems = workItems.filter(
    (item) => item.surface === "conversation" && item.lane === "check" && item.status !== "done",
  );
  const activeDrafts = assistantDrafts.filter((draft) => draft.targetSurface === "conversation" && draft.status === "draft");
  const activeHandoffs = handoffs.filter((handoff) => handoff.approvalState === "required");
  const draftCount = Math.max(activeCheckItems.length, activeDrafts.length);
  const totalCount = activeAskItems.length + draftCount + activeHandoffs.length;

  if (totalCount === 0) {
    return {
      hasItems: false,
      label: "큐 이어받기 없음",
      tone: "ready",
    };
  }

  const parts = [
    activeAskItems.length > 0 ? `질문 ${activeAskItems.length}` : undefined,
    draftCount > 0 ? `초안 ${draftCount}` : undefined,
    activeHandoffs.length > 0 ? `위임 ${activeHandoffs.length}` : undefined,
  ].filter(Boolean);
  const latestWorkItem = [...activeAskItems, ...activeCheckItems]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  return {
    hasItems: true,
    label: `큐 이어받기: ${parts.join(" · ")}`,
    latestTitle: latestWorkItem?.title ?? activeDrafts[0]?.title ?? activeHandoffs[0]?.summary,
    tone: "loading",
  };
}
