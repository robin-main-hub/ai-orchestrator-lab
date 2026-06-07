import type { ConversationMessage, TerminalTimelineBlock } from "@ai-orchestrator/protocol";
import type { Stage3DebateSession } from "../runtime/stage3Runtime";
import type { Stage3DebateUtteranceView } from "../types";
import {
  createConversationMessagePublicWorkTrace,
  createDebateUtterancePublicWorkTrace,
  createTerminalBlockPublicWorkTrace,
} from "./publicWorkTrace";
import type { WorkTraceSearchSource } from "./workTraceSearch";

export type CockpitWorkTraceSourceInput = {
  conversationMessages: ConversationMessage[];
  debateSession: Stage3DebateSession;
  tmuxBlocks: TerminalTimelineBlock[];
};

export function createCockpitWorkTraceSources({
  conversationMessages,
  debateSession,
  tmuxBlocks,
}: CockpitWorkTraceSourceInput): WorkTraceSearchSource[] {
  const userAttachmentTraceSources: WorkTraceSearchSource[] = conversationMessages
    .filter((message) => message.role === "user")
    .map((message) => ({
      message,
      trace: createConversationMessagePublicWorkTrace(message),
    }))
    .filter(({ trace }) => trace.groups.length > 0 || Boolean(trace.receipt))
    .slice(-12)
    .map(({ message, trace }) => ({
      id: message.id,
      kind: "conversation",
      title: "사용자 첨부 공개 영수증",
      trace,
    }));

  const assistantTraceSources: WorkTraceSearchSource[] = conversationMessages
    .filter((message) => message.role === "assistant")
    .slice(-12)
    .map((message) => ({
      id: message.id,
      kind: "conversation",
      title: "에이전트 대화 공개 영수증",
      trace: createConversationMessagePublicWorkTrace(message),
    }));

  const debateTraceSources: WorkTraceSearchSource[] = debateSession.rounds
    .flatMap((round) => round.utterances.map((utterance) => ({ round, utterance })))
    .slice(-12)
    .map(({ round, utterance }) => {
      const participant = debateSession.participants.find((candidate) => candidate.agentId === utterance.agentId);
      const view: Stage3DebateUtteranceView = {
        ...utterance,
        agentName: participant?.name ?? utterance.agentId,
        agentRole: participant?.role ?? "reviewer",
        roundTitle: round.title,
      };
      return {
        id: utterance.id,
        kind: "debate",
        title: `토론 공개 영수증 · ${round.title}`,
        trace: createDebateUtterancePublicWorkTrace(view),
      };
    });

  const tmuxTraceSources: WorkTraceSearchSource[] = tmuxBlocks.slice(-12).map((block) => ({
    id: block.id,
    kind: "tmux",
    title: block.title,
    trace: createTerminalBlockPublicWorkTrace(block),
  }));

  return [...userAttachmentTraceSources, ...assistantTraceSources, ...debateTraceSources, ...tmuxTraceSources];
}
