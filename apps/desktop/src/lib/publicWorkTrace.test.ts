import { describe, expect, it } from "vitest";
import type { ConversationMessage, TerminalTimelineBlock } from "@ai-orchestrator/protocol";
import {
  createConversationMessagePublicWorkTrace,
  createDebateUtterancePublicWorkTrace,
  createPublicWorkReceiptSummary,
  createPublicTraceSafetyReport,
  createTerminalBlockPublicWorkTrace,
} from "./publicWorkTrace";
import type { Stage3DebateUtteranceView } from "../types";

describe("publicWorkTrace", () => {
  it("사용자 첨부 메시지도 처리 계획과 마스킹 영수증을 공개 로그로 요약한다", () => {
    const trace = createConversationMessagePublicWorkTrace({
      id: "msg_user_attachment",
      sessionId: "session_main",
      role: "user",
      content: "이 화면 봐줘",
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
          {
            kind: "document",
            name: "secret.pdf",
            processingMode: "metadata_only",
            reason: "파일 크기 제한 초과",
            size: 20_000_000,
            status: "rejected",
            storage: "metadata_only",
          },
        ],
      },
    });

    expect(trace.receipt).toEqual({
      label: "에이전트 실행 영수증",
      status: "checkpointed",
      items: [
        { label: "범위", value: "첨부/메시지" },
        { label: "기준점", value: "msg_user_attachment" },
        { label: "마스킹", value: "적용됨" },
        { label: "공개 범위", value: "요약 단계만" },
      ],
    });
    expect(trace.groups[0]?.items).toContainEqual(
      expect.objectContaining({
        label: "첨부 준비",
        value: "첨부 1개 준비 · 이미지 vision 후보 1 · 거부 1",
      }),
    );
    expect(trace.groups[2]?.items).toContainEqual(
      expect.objectContaining({
        label: "첨부 거부",
        value: "secret.pdf · 파일 크기 제한 초과",
      }),
    );
  });

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
        personaDisplayName: "마키마",
        personaSoulApplied: true,
        personaAgentsMdApplied: true,
        personaSoulMdPath: "agents/orchestrator/SOUL.md",
        personaAgentsMdPath: "agents/orchestrator/AGENTS.md",
        roleToolProfileLabel: "지휘 도구",
        roleToolProfileTools: ["work.queue", "approval", "tmux.plan"],
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
      "도구 호출",
      "검증",
    ]);
    expect(trace.groups[0]?.items).toContainEqual(
      expect.objectContaining({
        label: "도구 호출",
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
    expect(trace.groups[1]?.items).toContainEqual(
      expect.objectContaining({
        label: "인격 설정",
        value: "마키마 · SOUL.md 적용 · AGENTS.md 적용",
      }),
    );
    expect(trace.groups[1]?.items).toContainEqual(
      expect.objectContaining({
        label: "도구 프로필",
        value: "지휘 도구 · 3개 후보",
      }),
    );
    expect(trace.groups[1]?.items).toContainEqual(
      expect.objectContaining({
        label: "명령 생성",
        value: "work.queue, approval, tmux.plan",
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
    expect(createPublicTraceSafetyReport(trace)).toMatchObject({
      isSafe: true,
      label: "마스킹 점검 통과",
    });
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
        roleToolProfileLabel: "도구",
        roleToolProfileTools: [
          "tool input: rm -rf /Users/robin/Documents",
          "https://token-plan-sgp.xiaomimimo.com/v1",
        ],
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
    expect(createPublicTraceSafetyReport(trace).isSafe).toBe(true);
  });

  it("공개 영수증 표시를 공통 형식으로 압축한다", () => {
    const trace = createConversationMessagePublicWorkTrace({
      id: "msg_assistant_long",
      sessionId: "session_main",
      role: "assistant",
      content: "응답",
      createdAt: "2026-06-05T08:00:00.000Z",
      metadata: {
        providerProfileId: "provider_mimo_token_openai",
        recallTraceId: "recall_agent_orchestrator_session_main_provider_mimo_token_openai_extra_long_tail",
        realProviderCall: true,
      },
    });

    const summary = createPublicWorkReceiptSummary(trace);

    expect(summary).toMatchObject({
      statusLabel: "저장됨",
    });
    expect(summary?.compactLabel).toContain("에이전트 실행 영수증");
    expect(summary?.detailItems.find((item) => item.label === "기준점")?.value.length).toBeLessThanOrEqual(57);
  });

  it("렌더 직전 공개 trace 안전점검은 마스킹되지 않은 금지 표면을 차단한다", () => {
    const report = createPublicTraceSafetyReport({
      groups: [
        {
          id: "evidence",
          title: "검증",
          items: [
            {
              id: "raw",
              label: "원문",
              tone: "danger",
              value: "raw prompt: hidden",
            },
          ],
        },
      ],
      receipt: {
        label: "에이전트 실행 영수증",
        status: "checkpointed",
        items: [{ label: "마스킹", value: "확인 필요" }],
      },
    });

    expect(report.isSafe).toBe(false);
    expect(report.label).toBe("마스킹 확인 필요");
  });

  it("메타데이터가 없는 assistant 메시지도 공개 가능한 응답 단계와 도구 경계를 보여준다", () => {
    const message: ConversationMessage = {
      id: "msg_assistant_plain",
      sessionId: "session_main",
      role: "assistant",
      content: "기본 답변입니다.",
      createdAt: "2026-06-05T08:00:00.000Z",
    };

    const trace = createConversationMessagePublicWorkTrace(message);

    expect(trace.receipt).toEqual({
      label: "에이전트 실행 영수증",
      status: "checkpointed",
      items: [
        { label: "범위", value: "메시지" },
        { label: "기준점", value: "msg_assistant_plain" },
        { label: "마스킹", value: "적용됨" },
        { label: "공개 범위", value: "요약 단계만" },
      ],
    });
    expect(trace.groups.map((group) => group.title)).toEqual([
      "작업 단계",
      "도구 호출",
      "검증",
    ]);
    expect(trace.groups[0]?.items[0]).toMatchObject({ label: "응답 단계", value: "공개 답변 생성" });
    expect(trace.groups[1]?.items[0]).toMatchObject({ label: "도구 호출", value: "필요 시 목적·입력·권한을 먼저 표시" });
    expect(trace.groups[2]?.items[0]).toMatchObject({ label: "검증 경계", value: "숨은 사고 과정 비공개 · 요약만 표시" });
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
      expect.objectContaining({ label: "토론 단계", value: "검증 라운드 · 검증자" }),
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
