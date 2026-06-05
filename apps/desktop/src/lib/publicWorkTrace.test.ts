import { describe, expect, it } from "vitest";
import type { ConversationMessage, TerminalTimelineBlock } from "@ai-orchestrator/protocol";
import {
  createConversationMessagePublicWorkTrace,
  createDebateUtterancePublicWorkTrace,
  createTerminalBlockPublicWorkTrace,
} from "./publicWorkTrace";
import type { Stage3DebateUtteranceView } from "../types";

describe("publicWorkTrace", () => {
  it("assistant 메시지 메타데이터를 공개 작업 로그로 요약한다", () => {
    const message: ConversationMessage = {
      id: "msg_assistant_1",
      sessionId: "session_main",
      role: "assistant",
      content: "검토 결과입니다.",
      createdAt: "2026-06-05T08:00:00.000Z",
      metadata: {
        agentId: "agent_orchestrator",
        providerProfileId: "provider_mimo_token_openai",
        modelId: "mimo-v2.5-pro",
        realProviderCall: true,
        route: "mimo-openai",
        usage: {
          totalTokens: 128,
        },
        memoryScope: "agent_orchestrator/session_main/provider_mimo_token_openai",
        memoryTraceId: "trace_memory_001",
        recallTraceId: "recall_agent_orchestrator_session_main_provider_mimo_token_openai",
        recalledMemoryCount: 4,
        runtimeConfigFileIds: ["config_memory_policy", "config_tool_profile"],
        delegationTags: [
          {
            prompt: "검증자에게 테스트 범위를 확인시켜라",
            status: "succeeded",
            target: "verifier",
          },
        ],
      },
    };

    const trace = createConversationMessagePublicWorkTrace(message);

    expect(trace.receipt).toEqual({
      label: "에이전트 실행 영수증",
      status: "checkpointed",
      items: [
        { label: "범위", value: "생성/도구/핸드오프/메모리" },
        { label: "기준점", value: "session_main · recall_agent_orchestrator_session_main_provider_mimo_token_openai" },
        { label: "마스킹", value: "적용됨" },
        { label: "공개 범위", value: "요약 단계만" },
      ],
    });
    expect(trace.groups.map((group) => group.title)).toEqual([
      "작업 단계",
      "명령·도구 제안",
      "검증·근거",
    ]);
    expect(trace.groups[0]?.items).toContainEqual(
      expect.objectContaining({
        label: "Provider 호출",
        tone: "success",
        value: "mimo-openai · mimo-v2.5-pro",
      }),
    );
    expect(trace.groups[0]?.items).toContainEqual(
      expect.objectContaining({
        label: "토큰 사용",
        value: "128 total tokens",
      }),
    );
    expect(trace.groups[1]?.items).toContainEqual(
      expect.objectContaining({
        label: "위임 제안",
        value: "verifier · succeeded",
      }),
    );
    expect(trace.groups[1]?.items).toContainEqual(
      expect.objectContaining({
        label: "런타임 규칙",
        value: "2개 config 적용",
      }),
    );
    expect(trace.groups[2]?.items).toContainEqual(
      expect.objectContaining({
        label: "기억 추적",
        value: "trace_memory_001",
      }),
    );
    expect(trace.groups[2]?.items).toContainEqual(
      expect.objectContaining({
        label: "기억 조회",
        value: "4개 recall · recall_agent_orchestrator_session_main_provider_mimo_token_openai",
      }),
    );
  });

  it("공개 로그에 비밀값처럼 보이는 문자열을 그대로 노출하지 않는다", () => {
    const message: ConversationMessage = {
      id: "msg_assistant_secret",
      sessionId: "session_main",
      role: "assistant",
      content: "응답",
      createdAt: "2026-06-05T08:00:00.000Z",
      metadata: {
        error: "Bearer sk-1234567890abcdef leaked via tp-slmvllbti6z4gmjnj5srk2r9nqdbhj5hteonqwswxks2o6ge",
        providerProfileId: "provider_apifun_claude",
      },
    };

    const trace = createConversationMessagePublicWorkTrace(message);
    const serialized = JSON.stringify(trace);

    expect(serialized).not.toContain("sk-1234567890abcdef");
    expect(serialized).not.toContain("tp-slmvllbti6z4gmjnj5srk2r9nqdbhj5hteonqwswxks2o6ge");
    expect(serialized).toContain("[redacted]");
  });

  it("공개 작업 로그는 내부 추론과 원문 도구 입력을 요약 경계로 마스킹한다", () => {
    const message: ConversationMessage = {
      id: "msg_assistant_cot",
      sessionId: "session_main",
      role: "assistant",
      content: "응답",
      createdAt: "2026-06-05T08:00:00.000Z",
      metadata: {
        error: [
          "chain-of-thought: hidden reasoning",
          "raw prompt: original system message",
          "tool input: rm -rf /Users/robin/Documents",
          "endpoint=https://token-plan-sgp.xiaomimimo.com/v1",
        ].join("\n"),
        providerProfileId: "provider_mimo_token_openai",
      },
    };

    const trace = createConversationMessagePublicWorkTrace(message);
    const serialized = JSON.stringify(trace);

    expect(serialized).not.toContain("hidden reasoning");
    expect(serialized).not.toContain("original system message");
    expect(serialized).not.toContain("rm -rf");
    expect(serialized).not.toContain("https://token-plan-sgp.xiaomimimo.com/v1");
    expect(serialized).toContain("[redacted:internal]");
    expect(trace.receipt?.items).toContainEqual({ label: "공개 범위", value: "요약 단계만" });
  });

  it("토론 발언의 태그와 근거를 같은 공개 로그 모델로 변환한다", () => {
    const utterance: Stage3DebateUtteranceView = {
      id: "utt_1",
      agentId: "agent_verifier",
      roundId: "round_1",
      content: "테스트 범위가 부족합니다.",
      tags: ["risk", "evidence"],
      evidenceRefIds: ["evidence_1", "evidence_2"],
      codingImpactRefs: ["coding_1"],
      createdAt: "2026-06-05T08:00:00.000Z",
      agentName: "마키세 크리스",
      agentRole: "verifier",
      roundTitle: "검증 라운드",
    };

    const trace = createDebateUtterancePublicWorkTrace(utterance);

    expect(trace.groups[0]?.items).toContainEqual(
      expect.objectContaining({ label: "토론 단계", value: "검증 라운드 · Verifier" }),
    );
    expect(trace.groups[2]?.items).toContainEqual(
      expect.objectContaining({ label: "근거", value: "2개 evidence ref" }),
    );
  });

  it("tmux 타임라인 block을 명령/검증 로그로 변환한다", () => {
    const block: TerminalTimelineBlock = {
      id: "block_1",
      sessionId: "session_main",
      terminalSessionId: "terminal_session_ai_swarm",
      paneId: "role:qa",
      role: "qa",
      host: "dgx_02",
      kind: "dispatch",
      status: "completed",
      title: "QA dispatch",
      summary: "테스트 명령 실행 완료",
      relatedEventIds: ["event_1"],
      outputPreview: "153 passed",
      redactionApplied: true,
      createdAt: "2026-06-05T08:00:00.000Z",
    };

    const trace = createTerminalBlockPublicWorkTrace(block);

    expect(trace.receipt).toEqual({
      label: "Tmux 실행 영수증",
      status: "checkpointed",
      items: [
        { label: "범위", value: "디스패치" },
        { label: "기준점", value: "terminal_session_ai_swarm · role:qa" },
        { label: "마스킹", value: "적용됨" },
      ],
    });
    expect(trace.groups[0]?.items).toContainEqual(
      expect.objectContaining({ label: "tmux 단계", value: "dispatch · completed" }),
    );
    expect(trace.groups[2]?.items).toContainEqual(
      expect.objectContaining({ label: "출력", value: "153 passed" }),
    );
  });
});
