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
  it("사용자 첨부 메시지도 처리 계획과 마스킹 브리핑을 공개 로그로 요약한다", () => {
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
      label: "에이전트 실행 브리핑",
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
        value: "첨부 1개 준비 · 이미지 확인 후보 1 · 거부 1",
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
        identityGuardApplied: true,
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
      label: "에이전트 실행 브리핑",
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
        value: "MiMo · MiMo V2.5 Pro",
      }),
    );
    expect(trace.groups[0]?.items).toContainEqual(
      expect.objectContaining({
        label: "토큰 사용",
        value: "총 토큰 128개",
      }),
    );
    expect(trace.groups[1]?.items).toContainEqual(
      expect.objectContaining({
        label: "위임 제안",
        value: "verifier · 성공",
      }),
    );
    expect(trace.groups[1]?.items).toContainEqual(
      expect.objectContaining({
        label: "런타임 규칙",
        value: "설정 2개 적용",
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
        label: "이름 보정",
        value: "마키마 정체성으로 응답 보정",
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
        value: "기억 4개 조회 · recall_agent_orchestrator_session_main_provider_mimo_token_openai",
      }),
    );
  });

  it("assistant 메시지에 복사된 첨부 계획은 사용자 첨부 준비 브리핑으로 중복 계산하지 않는다", () => {
    const trace = createConversationMessagePublicWorkTrace({
      id: "msg_assistant_attachment_echo",
      sessionId: "session_main",
      role: "assistant",
      content: "첨부를 보고 답했습니다.",
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
        modelId: "mimo-v2.5-pro",
        providerProfileId: "provider_mimo_token_openai",
        realProviderCall: true,
      },
    });

    expect(JSON.stringify(trace.groups)).not.toContain("첨부 준비");
    expect(trace.receipt?.items).toContainEqual({ label: "범위", value: "생성" });
  });

  it("공개 로그는 원시 공급자 ID 대신 사용자가 읽을 수 있는 경로명을 표시한다", () => {
    const trace = createConversationMessagePublicWorkTrace({
      id: "message_route",
      role: "assistant",
      content: "응답",
      createdAt: "2026-06-06T00:00:00.000Z",
      sessionId: "session_main",
      metadata: {
        providerProfileId: "provider_mock_local",
        modelId: "mock-orchestrator",
        realProviderCall: false,
      },
    });

    const serialized = JSON.stringify(trace);
    expect(serialized).toContain("로컬 목업 경로");
    expect(serialized).toContain("Mock Orchestrator");
    expect(serialized).not.toContain("provider_mock_local");
  });

  it("승인 대기와 실패 대화 브리핑은 저장됨이 아니라 live/blocked 상태로 남긴다", () => {
    const pendingTrace = createConversationMessagePublicWorkTrace({
      id: "message_pending_approval",
      role: "assistant",
      content: "승인이 필요합니다.",
      createdAt: "2026-06-06T00:00:00.000Z",
      sessionId: "session_main",
      metadata: {
        providerProfileId: "provider_mimo_token_openai",
        requiresServerApproval: true,
      },
    });
    const failedTrace = createConversationMessagePublicWorkTrace({
      id: "message_failed",
      role: "assistant",
      content: "호출 실패",
      createdAt: "2026-06-06T00:00:00.000Z",
      sessionId: "session_main",
      metadata: {
        error: "Failed to fetch",
        providerProfileId: "provider_mimo_token_openai",
      },
    });

    expect(pendingTrace.receipt?.status).toBe("live");
    expect(failedTrace.receipt?.status).toBe("blocked");
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

  it("직접 provider 호출이 성공한 fallback은 실패 경고가 아니라 프록시 우회 성공으로 표시한다", () => {
    const trace = createConversationMessagePublicWorkTrace({
      id: "msg_direct_fallback",
      role: "assistant",
      content: "응답",
      createdAt: "2026-06-06T00:00:00.000Z",
      sessionId: "session_main",
      metadata: {
        fallbackReason: "http://dgx-02:4317: Failed to fetch",
        modelId: "mimo-v2.5-pro",
        providerProfileId: "provider_mimo_token_openai",
        realProviderCall: true,
        route: "direct_provider",
      },
    });

    expect(trace.groups[0]?.items).toContainEqual(
      expect.objectContaining({
        label: "프록시 우회",
        tone: "success",
        value: "DGX 프록시 미응답 · 기본 MiMo 직접 호출 성공",
      }),
    );
    expect(JSON.stringify(trace)).not.toContain("Failed to fetch");
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

  it("공개 브리핑 표시를 공통 형식으로 압축한다", () => {
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
    expect(summary?.compactLabel).toContain("에이전트 실행 브리핑");
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
        label: "에이전트 실행 브리핑",
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
      label: "에이전트 실행 브리핑",
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
      expect.objectContaining({ label: "근거", value: "근거 참조 2개" }),
    );
    expect(trace.groups[1]?.items).toContainEqual(
      expect.objectContaining({ label: "코딩 영향", value: "코딩 참조 1개" }),
    );
  });

  it("터미널 타임라인 block을 명령/검증 로그로 변환한다", () => {
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
      label: "터미널 실행 브리핑",
      status: "checkpointed",
      items: [
        { label: "범위", value: "디스패치" },
        { label: "기준점", value: "terminal_session_ai_swarm · role:qa" },
        { label: "마스킹", value: "적용됨" },
      ],
    });
    expect(trace.groups[0]?.items).toContainEqual(
      expect.objectContaining({ label: "터미널 단계", value: "디스패치 · 완료" }),
    );
    expect(trace.groups[2]?.items).toContainEqual(
      expect.objectContaining({ label: "출력", value: "153 passed" }),
    );
  });

  it("공개 trace 표시값에는 작업 용어 영어 찌꺼기를 남기지 않는다", () => {
    const messageTrace = createConversationMessagePublicWorkTrace({
      id: "msg_assistant_visible_copy",
      sessionId: "session_main",
      role: "assistant",
      content: "응답",
      createdAt: "2026-06-05T08:00:00.000Z",
      metadata: {
        realProviderCall: false,
        usage: { totalTokens: 9 },
        recalledMemoryCount: 2,
        recallTraceId: "recall_visible",
      },
    });
    const debateTrace = createDebateUtterancePublicWorkTrace({
      id: "utt_visible",
      agentId: "agent_reviewer",
      roundId: "round_visible",
      content: "근거가 필요합니다.",
      tags: ["risk"],
      evidenceRefIds: ["evidence_1"],
      codingImpactRefs: ["coding_1"],
      createdAt: "2026-06-05T08:00:00.000Z",
      agentName: "시노미야 카구야",
      agentRole: "reviewer",
      roundTitle: "검토 라운드",
    });
    const visibleValues = [
      ...messageTrace.groups.flatMap((group) => group.items.flatMap((item) => [item.label, item.value])),
      ...debateTrace.groups.flatMap((group) => group.items.flatMap((item) => [item.label, item.value])),
      createPublicWorkReceiptSummary(messageTrace)?.statusLabel,
    ].join("\n");

    expect(visibleValues).not.toContain("fallback");
    expect(visibleValues).not.toContain("tmux");
    expect(visibleValues).not.toContain("total tokens");
    expect(visibleValues).not.toContain("coding ref");
    expect(visibleValues).not.toContain("evidence ref");
    expect(visibleValues).not.toContain("recall ·");
    expect(visibleValues).not.toContain("폴백");
    expect(visibleValues).toContain("대체 경로");
    expect(visibleValues).toContain("총 토큰 9개");
    expect(visibleValues).toContain("기억 2개 조회");
  });
});
