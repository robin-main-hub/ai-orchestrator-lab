import { useMemo, useState } from "react";
import type {
  BranchExperiment,
  ContextPackTier,
  ConversationMessage,
  EventEnvelope,
} from "@ai-orchestrator/protocol";
import { initialBranchExperiments } from "../seeds/conversation";

type AppendWorkbenchEvent = <T>(type: string, payload: T) => EventEnvelope<T>;

type BranchExperimentsControllerInput = {
  activeSessionId: string;
  appendConversationMessage: (message: ConversationMessage) => void;
  appendEvent: AppendWorkbenchEvent;
  contextPackTier: ContextPackTier;
  selectedAgentName?: string;
};

export function useBranchExperimentsController({
  activeSessionId,
  appendConversationMessage,
  appendEvent,
  contextPackTier,
  selectedAgentName,
}: BranchExperimentsControllerInput) {
  const [branchExperiments, setBranchExperiments] = useState<BranchExperiment[]>(initialBranchExperiments);

  const adoptedBranchSummaries = useMemo(
    () =>
      branchExperiments
        .filter((branch) => branch.status === "adopted")
        .map((branch) => `Adopted branch ${branch.title}: ${branch.summary}`)
        .slice(0, 3),
    [branchExperiments],
  );

  function handleCreateBranchExperiment() {
    const createdAt = new Date().toISOString();
    const agentName = selectedAgentName ?? "Agent";
    const nextBranch: BranchExperiment = {
      id: `branch_${crypto.randomUUID()}`,
      sourceSessionId: activeSessionId,
      title: `shadow: ${agentName} ${branchExperiments.length + 1}`,
      agentName,
      status: "ready",
      summary: `${agentName}가 ${contextPackTier} ContextPack으로 현재 요구사항을 별도 shadow conversation에서 검토한 결과`,
      createdAt,
    };

    setBranchExperiments((branches) => [nextBranch, ...branches].slice(0, 8));
    appendEvent("conversation.branch.created", {
      branch: nextBranch,
      contextPackTier,
      adoptPolicy: "summary_only",
    });
  }

  function handleAdoptBranchExperiment() {
    const branch = branchExperiments.find((candidate) => candidate.status !== "adopted");
    if (!branch) {
      return;
    }

    const createdAt = new Date().toISOString();
    const adoptionMessage: ConversationMessage = {
      id: `message_branch_adopted_${crypto.randomUUID()}`,
      sessionId: activeSessionId,
      role: "assistant",
      content: `Branch 채택: ${branch.title} - ${branch.summary}`,
      createdAt,
      metadata: {
        branchId: branch.id,
        branchAdopted: true,
        contextPolicy: "summary_only",
      },
    };

    setBranchExperiments((branches) =>
      branches.map((candidate) => (candidate.id === branch.id ? { ...candidate, status: "adopted" } : candidate)),
    );
    appendConversationMessage(adoptionMessage);
    appendEvent("conversation.branch.adopted", {
      branchId: branch.id,
      title: branch.title,
      summary: branch.summary,
      contextPolicy: "summary_only",
    });
    appendEvent("conversation.message.created", {
      messageId: adoptionMessage.id,
      role: adoptionMessage.role,
      content: adoptionMessage.content,
      metadata: adoptionMessage.metadata,
      redaction: "applied",
    });
  }

  return {
    adoptedBranchSummaries,
    branchExperiments,
    handleAdoptBranchExperiment,
    handleCreateBranchExperiment,
  };
}
