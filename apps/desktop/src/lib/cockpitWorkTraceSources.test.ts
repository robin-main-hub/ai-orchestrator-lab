import { describe, expect, it } from "vitest";
import type { ApprovalQueueItem, ConversationMessage, TerminalTimelineBlock } from "@ai-orchestrator/protocol";
import type { Stage3DebateSession } from "../runtime/stage3Runtime";
import { createCockpitWorkTraceSources } from "./cockpitWorkTraceSources";

const assistantMessage: ConversationMessage = {
  id: "msg_assistant_1",
  sessionId: "session_main",
  role: "assistant",
  content: "검토 결과입니다.",
  createdAt: "2026-06-05T08:00:00.000Z",
  metadata: {
    agentId: "agent_orchestrator",
    modelId: "mimo-v2.5-pro",
    providerProfileId: "provider_mimo_token_openai",
    realProviderCall: true,
  },
};

const userMessage: ConversationMessage = {
  id: "msg_user_1",
  sessionId: "session_main",
  role: "user",
  content: "검토해줘.",
  createdAt: "2026-06-05T08:00:00.000Z",
  metadata: {
    attachmentProcessingPlans: [
      {
        kind: "image",
        name: "screen.png",
        processingMode: "vision_candidate",
        size: 120_000,
        status: "accepted",
        storage: "metadata_only",
      },
    ],
  },
};

const debateSession: Stage3DebateSession = {
  id: "debate_session_1",
  problem: "패킷 반영 여부",
  summary: "토론 요약",
  contextPreview: [],
  participants: [
    {
      agentId: "agent_reviewer",
      modelId: "mimo-v2.5-pro",
      name: "시노미야 카구야",
      providerName: "MiMo",
      role: "reviewer",
    },
  ],
  promotedAt: "2026-06-05T08:00:00.000Z",
  humanPeek: [],
  statusHub: [],
  rounds: [
    {
      id: "round_1",
      debateId: "debate_session_1",
      kind: "final_decision",
      status: "completed",
      title: "최종 결정",
      utterances: [
        {
          id: "utterance_1",
          agentId: "agent_reviewer",
          content: "결정 근거가 충분합니다.",
          createdAt: "2026-06-05T08:01:00.000Z",
          evidenceRefIds: ["evidence_1"],
          roundId: "round_1",
          tags: ["evidence", "coding_impact"],
        },
      ],
    },
  ],
};

const tmuxBlock: TerminalTimelineBlock = {
  id: "tmux_block_1",
  sessionId: "session_main",
  terminalSessionId: "terminal_session_ai_swarm",
  paneId: "role:qa",
  role: "qa",
  host: "local_mac",
  kind: "dispatch",
  status: "completed",
  title: "QA dispatch",
  summary: "테스트 실행",
  relatedEventIds: [],
  redactionApplied: true,
  createdAt: "2026-06-05T08:02:00.000Z",
};

const approvalItem: ApprovalQueueItem = {
  id: "queue_permission_provider",
  sourceItemId: "permission_provider_mimo",
  summary: "provider_completion from agent",
  requestedBy: "agent",
  action: "provider_completion",
  reason: "provider completion requires approval",
  sourceTrust: "limited",
  permissions: ["network_access"],
  state: "required",
  createdAt: "2026-06-05T08:03:00.000Z",
};

describe("createCockpitWorkTraceSources", () => {
  it("대화, 토론, tmux, 승인 공개 영수증을 최신순 Cockpit 색인 소스로 만든다", () => {
    const sources = createCockpitWorkTraceSources({
      approvalItems: [approvalItem],
      conversationMessages: [userMessage, assistantMessage],
      debateSession,
      tmuxBlocks: [tmuxBlock],
    });

    expect(sources.map((source) => source.kind)).toEqual(["approval", "tmux", "debate", "conversation", "conversation"]);
    expect(sources[0]).toMatchObject({
      id: "queue_permission_provider",
      title: "승인 공개 영수증 · provider completion",
    });
    expect(sources[0]?.trace.receipt?.label).toBe("에이전트 실행 영수증");
    expect(sources).toContainEqual(expect.objectContaining({
      id: "msg_user_1",
      title: "사용자 첨부 공개 영수증",
    }));
    expect(sources.find((source) => source.kind === "debate")).toMatchObject({
      id: "utterance_1",
      title: "토론 공개 영수증 · 최종 결정",
    });
    expect(sources.find((source) => source.kind === "debate")?.trace.receipt?.label).toBe("토론 실행 영수증");
  });
});

// Characterization tests for the previously-uncovered approval-projection branch
// tree and the invalid-timestamp sort path (no behavior change). The existing
// suite pins only one approval shape (state=required, trust=limited); these pin
// the approved/rejected/not_required/unknown state labels with their tone and
// receipt-status mappings, the trusted/absent sourceTrust suffix, the
// action/permission "승인"/"보기 전용" fallbacks, reason→summary fallback, and
// that an unparseable createdAt sorts to the end via timestampOf→0. All pure.
describe("cockpitWorkTraceSources — approval projection & sort characterization", () => {
  function approval(overrides: Partial<ApprovalQueueItem> = {}): ApprovalQueueItem {
    return { ...approvalItem, ...overrides };
  }

  function approvalSource(item: ApprovalQueueItem) {
    const [source] = createCockpitWorkTraceSources({
      approvalItems: [item],
      conversationMessages: [],
      debateSession: { ...debateSession, rounds: [] },
      tmuxBlocks: [],
    });
    return source;
  }

  it("maps an approved item to a success tone and a checkpointed receipt", () => {
    const source = approvalSource(approval({ state: "approved" }));
    const stateItem = source?.trace.groups[0]?.items[0];
    expect(stateItem?.value).toContain("승인됨");
    expect(stateItem?.tone).toBe("success");
    expect(source?.trace.groups[2]?.items[0]?.tone).toBe("neutral");
    expect(source?.trace.receipt?.status).toBe("checkpointed");
  });

  it("maps a rejected item to danger tones on both state and reason, with a blocked receipt", () => {
    const source = approvalSource(approval({ state: "rejected" }));
    expect(source?.trace.groups[0]?.items[0]?.value).toContain("거부됨");
    expect(source?.trace.groups[0]?.items[0]?.tone).toBe("danger");
    expect(source?.trace.groups[2]?.items[0]?.tone).toBe("danger");
    expect(source?.trace.receipt?.status).toBe("blocked");
  });

  it("labels not_required and unknown states distinctly", () => {
    expect(approvalSource(approval({ state: "not_required" }))?.trace.groups[0]?.items[0]?.value).toContain(
      "승인 불필요",
    );
    expect(
      approvalSource(approval({ state: "checking" as ApprovalQueueItem["state"] }))?.trace.groups[0]?.items[0]?.value,
    ).toContain("확인 필요");
  });

  it("surfaces a trusted sourceTrust as '신뢰 높음' and omits the segment when absent", () => {
    expect(approvalSource(approval({ sourceTrust: "trusted" }))?.trace.groups[0]?.items[0]?.value).toContain(
      "신뢰 높음",
    );
    expect(approvalSource(approval({ sourceTrust: undefined }))?.trace.groups[0]?.items[0]?.value).not.toContain(
      "신뢰",
    );
  });

  it("falls back to '승인' action label and '보기 전용' permission value when action and permissions are empty", () => {
    const source = approvalSource(approval({ action: undefined, permissions: [] }));
    expect(source?.title).toBe("승인 공개 영수증 · 승인");
    expect(source?.trace.groups[1]?.items[0]?.value).toBe("보기 전용");
  });

  it("falls back to the summary text when an approval has no explicit reason", () => {
    const source = approvalSource(approval({ reason: undefined, summary: "요약 근거" }));
    expect(source?.trace.groups[2]?.items[0]?.value).toBe("요약 근거");
  });

  it("sorts an approval with an unparseable createdAt to the end (timestampOf → 0)", () => {
    const sources = createCockpitWorkTraceSources({
      approvalItems: [approval({ id: "queue_bad_time", createdAt: "not-a-date" })],
      conversationMessages: [],
      debateSession: { ...debateSession, rounds: [] },
      tmuxBlocks: [tmuxBlock],
    });
    expect(sources.map((source) => source.id)).toEqual(["tmux_block_1", "queue_bad_time"]);
  });
});
