import { describe, expect, it } from "vitest";
import type { ConversationMessage, TerminalTimelineBlock } from "@ai-orchestrator/protocol";
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

describe("createCockpitWorkTraceSources", () => {
  it("대화, 토론, tmux 공개 영수증을 하나의 Cockpit 색인 소스로 만든다", () => {
    const sources = createCockpitWorkTraceSources({
      conversationMessages: [userMessage, assistantMessage],
      debateSession,
      tmuxBlocks: [tmuxBlock],
    });

    expect(sources.map((source) => source.kind)).toEqual(["conversation", "debate", "tmux"]);
    expect(sources.find((source) => source.kind === "debate")).toMatchObject({
      id: "utterance_1",
      title: "토론 공개 영수증 · 최종 결정",
    });
    expect(sources.find((source) => source.kind === "debate")?.trace.receipt?.label).toBe("토론 실행 영수증");
  });
});
