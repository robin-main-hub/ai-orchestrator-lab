import type { ApprovalQueueItem, ConversationMessage, TerminalTimelineBlock } from "@ai-orchestrator/protocol";
import type { Stage3DebateSession } from "../runtime/stage3Runtime";
import type { Stage3DebateUtteranceView } from "../types";
import {
  createConversationMessagePublicWorkTrace,
  createDebateUtterancePublicWorkTrace,
  createTerminalBlockPublicWorkTrace,
  type PublicWorkTrace,
} from "./publicWorkTrace";
import { sanitizePublicText } from "./publicRedaction";
import type { WorkTraceSearchSource } from "./workTraceSearch";

export type CockpitWorkTraceSourceInput = {
  approvalItems?: ApprovalQueueItem[];
  conversationMessages: ConversationMessage[];
  debateSession: Stage3DebateSession;
  tmuxBlocks: TerminalTimelineBlock[];
};

export function createCockpitWorkTraceSources({
  approvalItems = [],
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
      createdAt: message.createdAt,
      id: message.id,
      kind: "conversation",
      title: "사용자 첨부 공개 브리핑",
      trace,
    }));

  const assistantTraceSources: WorkTraceSearchSource[] = conversationMessages
    .filter((message) => message.role === "assistant")
    .slice(-12)
    .map((message) => ({
      createdAt: message.createdAt,
      id: message.id,
      kind: "conversation",
      title: "에이전트 대화 공개 브리핑",
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
        createdAt: utterance.createdAt,
        id: utterance.id,
        kind: "debate",
        title: `토론 공개 브리핑 · ${round.title}`,
        trace: createDebateUtterancePublicWorkTrace(view),
      };
    });

  const tmuxTraceSources: WorkTraceSearchSource[] = tmuxBlocks.slice(-12).map((block) => ({
    createdAt: block.createdAt,
    id: block.id,
    kind: "tmux",
    title: block.title,
    trace: createTerminalBlockPublicWorkTrace(block),
  }));

  const approvalTraceSources: WorkTraceSearchSource[] = approvalItems.slice(-12).map((item) => ({
    createdAt: item.createdAt,
    id: item.id,
    kind: "approval",
    title: `승인 공개 브리핑 · ${approvalActionLabel(item.action ?? item.permissions[0])}`,
    trace: createApprovalQueuePublicWorkTrace(item),
  }));

  return [
    ...userAttachmentTraceSources,
    ...assistantTraceSources,
    ...debateTraceSources,
    ...tmuxTraceSources,
    ...approvalTraceSources,
  ].sort((left, right) => timestampOf(right.createdAt) - timestampOf(left.createdAt));
}

function createApprovalQueuePublicWorkTrace(item: ApprovalQueueItem): PublicWorkTrace {
  const permissionLabel = approvalActionLabel(item.action ?? item.permissions[0]);
  const stateLabel = approvalStateLabel(item.state);
  const sourceTrust = item.sourceTrust ? ` · 신뢰 ${sourceTrustLabel(item.sourceTrust)}` : "";
  return {
    groups: [
      {
        id: "steps",
        title: "작업 단계",
        items: [
          {
            id: "approval-state",
            label: "승인 상태",
            tone: item.state === "required" ? "warning" : item.state === "rejected" ? "danger" : "success",
            value: sanitizePublicText(`${stateLabel} · ${permissionLabel}${sourceTrust}`),
          },
        ],
      },
      {
        id: "commands",
        title: "도구 호출",
        items: [
          {
            id: "approval-permissions",
            label: "권한",
            tone: "info",
            value: sanitizePublicText(item.permissions.map(approvalActionLabel).join(", ") || "보기 전용"),
          },
        ],
      },
      {
        id: "evidence",
        title: "검증",
        items: [
          {
            id: "approval-reason",
            label: "근거",
            tone: item.state === "rejected" ? "danger" : "neutral",
            value: sanitizePublicText(item.reason ?? item.summary),
          },
        ],
      },
    ],
    receipt: {
      label: "에이전트 실행 브리핑",
      status: item.state === "rejected" ? "blocked" : item.state === "required" ? "live" : "checkpointed",
      items: [
        { label: "범위", value: sanitizePublicText(`승인/${permissionLabel}`) },
        { label: "기준점", value: sanitizePublicText(item.sourceItemId) },
        { label: "마스킹", value: "적용됨" },
        { label: "공개 범위", value: "요약 단계만" },
      ],
    },
  };
}

function approvalActionLabel(value: string | undefined) {
  if (!value) return "승인";
  return value.replace(/_/g, " ");
}

function approvalStateLabel(value: ApprovalQueueItem["state"]) {
  if (value === "required") return "대기";
  if (value === "approved") return "승인됨";
  if (value === "rejected") return "거부됨";
  if (value === "not_required") return "승인 불필요";
  return "확인 필요";
}

function sourceTrustLabel(value: NonNullable<ApprovalQueueItem["sourceTrust"]>) {
  if (value === "trusted") return "높음";
  if (value === "limited") return "제한";
  return "낮음";
}

function timestampOf(value?: string) {
  const time = value ? Date.parse(value) : 0;
  return Number.isFinite(time) ? time : 0;
}
