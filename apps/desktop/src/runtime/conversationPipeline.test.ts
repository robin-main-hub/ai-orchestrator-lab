import { describe, expect, it } from "vitest";
import type { ConversationMessage } from "@ai-orchestrator/protocol";
import type {
  AgentConfigFile,
  AgentPersonaSettings,
  WorkbenchAgent,
} from "../types";
import type { AgentChannelMemoryScope } from "../lib/agentConversationChannels";
import { createAgentChannelMemoryScope } from "../lib/agentConversationChannels";
import type { Stage6MemoryInspector } from "./stage6Memory";
import { seededAgentProfiles } from "../seeds/agents";
import { createConversationPipelineMessages } from "./conversationPipeline";

const createdAt = "2026-06-05T00:00:00.000Z";

const agent = {
  ...seededAgentProfiles[0]!,
  id: "agent_orchestrator",
  role: "orchestrator",
  name: "마키마",
  soulMode: "summary",
} satisfies WorkbenchAgent;

const provider = {
  id: "provider_mimo_token_openai",
  name: "MiMo Token Plan",
};

const persona: AgentPersonaSettings = {
  voicePreset: "direct",
  creativityLevel: "focused",
  agentsMdPath: "agents/orchestrator/AGENTS.md",
  soulMdPath: "agents/orchestrator/SOUL.md",
  soulSummary: "총괄 지휘자",
  soulExampleDialogue: "사용자: 빠르게 해줘\n마키마: 범위는 유지하고 즉시 처리하겠습니다.",
  agentsInstruction: "한국어로 지휘한다.",
  forbiddenStyle: "무성의한 단답",
};

const memoryScope: AgentChannelMemoryScope = {
  agentId: "agent_orchestrator",
  sessionId: "session_main",
  providerProfileId: "provider_mimo_token_openai",
  namespace: "agent:agent_orchestrator/session:session_main/provider:provider_mimo_token_openai",
  recallTraceId: "recall_agent_orchestrator_session_main_provider_mimo_token_openai",
};

const memory = {
  trace: {
    id: "trace_memory_001",
    results: [
      {
        usedInDecision: true,
        score: 0.91,
        record: {
          title: "이전 대화",
          content: "사용자는 한국어 보고를 선호한다.",
          sessionId: "session_main",
          tags: ["agent:agent_orchestrator", "provider:provider_mimo_token_openai"],
        },
      },
      {
        usedInDecision: false,
        score: 0.5,
        record: {
          title: "미사용 기억",
          content: "이 문장은 들어가면 안 된다.",
          sessionId: "session_main",
          tags: ["agent:agent_orchestrator", "provider:provider_mimo_token_openai"],
        },
      },
    ],
  },
} as unknown as Stage6MemoryInspector;

const configFiles: AgentConfigFile[] = [
  {
    id: "config_skill_role_tool_profiles_v1",
    kind: "skill",
    label: "역할별 도구 호출 프로필",
    scope: "project",
    path: "agents/skills/ROLE_TOOL_PROFILES.md",
    tags: ["tools"],
    version: 1,
    linkedAgentIds: ["agent_orchestrator"],
    updatedAt: createdAt,
    body: "필요한 도구 호출은 먼저 목적과 권한을 설명한다. SECRET_KEY=do-not-leak",
  },
];

function message(id: string, role: ConversationMessage["role"], content: string): ConversationMessage {
  return {
    id,
    role,
    content,
    createdAt,
    sessionId: "session_main",
  };
}

describe("conversation pipeline runtime helper", () => {
  it("assembles a Korean system prompt with agent config, memory scope, recalls, and metadata", () => {
    const userMessage = message("message_user_latest", "user", "다음 작업을 진행해");
    const previousMessages = Array.from({ length: 10 }, (_, index) =>
      message(`message_previous_${index}`, index % 2 === 0 ? "user" : "assistant", `이전 메시지 ${index}`),
    );

    const pipeline = createConversationPipelineMessages({
      agent,
      configFiles,
      memory,
      memoryScope,
      modelId: "mimo-v2.5-pro",
      persona,
      previousMessages,
      provider,
      systemMessageId: "message_system_pipeline_test",
      userMessage,
    });

    expect(pipeline).toHaveLength(10);
    expect(pipeline[0]).toMatchObject({
      id: "message_system_pipeline_test",
      role: "system",
      sessionId: "session_main",
      metadata: {
        agentId: "agent_orchestrator",
        providerProfileId: "provider_mimo_token_openai",
        modelId: "mimo-v2.5-pro",
        memoryTraceId: "trace_memory_001",
        recalledMemoryCount: 1,
        memoryScope: memoryScope.namespace,
        memoryScopeAgentId: "agent_orchestrator",
        memoryScopeProviderProfileId: "provider_mimo_token_openai",
        memoryScopeSessionId: "session_main",
        recallTraceId: memoryScope.recallTraceId,
        runtimeConfigFileIds: ["config_skill_role_tool_profiles_v1"],
      },
    });
    expect(pipeline[0]?.content).toContain("AI Orchestrator Lab conversation pipeline.");
    expect(pipeline[0]?.content).toContain("Reply in Korean");
    expect(pipeline[0]?.content).toContain("The active agent persona is binding");
    expect(pipeline[0]?.content).toContain("Agent: 마키마 / role: orchestrator");
    expect(pipeline[0]?.content).toContain(
      "Identity contract: your name is 마키마. If the user asks your name, answer 마키마",
    );
    expect(pipeline[0]?.content).toContain("Provider: MiMo Token Plan / model: mimo-v2.5-pro");
    expect(pipeline[0]?.content).toContain("SOUL.md path: agents/orchestrator/SOUL.md");
    expect(pipeline[0]?.content).toContain("AGENTS.md path: agents/orchestrator/AGENTS.md");
    expect(pipeline[0]?.content).toContain("SOUL.md content:");
    expect(pipeline[0]?.content).toContain("저는 Makima입니다");
    expect(pipeline[0]?.content).toContain("본명: Makima (마키마)");
    expect(pipeline[0]?.content).toContain("사용자: 빠르게 해줘");
    expect(pipeline[0]?.content).toContain("Forbidden style: 무성의한 단답");
    expect(pipeline[0]?.content).toContain(`namespace=${memoryScope.namespace}`);
    expect(pipeline[0]?.content).toContain(memoryScope.recallTraceId);
    expect(pipeline[0]?.content).toContain("역할별 도구 호출 프로필");
    expect(pipeline[0]?.content).toContain("# 역할 기반 도구 사용 계약");
    expect(pipeline[0]?.content).toContain("도구 묶음: 지휘 도구");
    expect(pipeline[0]?.content).toContain("허용 도구: work.queue, approval, tmux.plan");
    expect(pipeline[0]?.metadata).toMatchObject({
      roleToolProfileLabel: "지휘 도구",
      roleToolProfileTools: ["work.queue", "approval", "tmux.plan"],
    });
    expect(pipeline[0]?.content).toContain("[REDACTED:env_secret]");
    expect(pipeline[0]?.content).toContain("EvolveMemento recall:");
    expect(pipeline[0]?.content).toContain("이전 대화: 사용자는 한국어 보고를 선호한다.");
    expect(pipeline[0]?.content).not.toContain("미사용 기억");
    expect(pipeline.slice(1, -1).map((item) => item.id)).toEqual(
      previousMessages.slice(-8).map((item) => item.id),
    );
    expect(pipeline.at(-1)).toBe(userMessage);
  });

  it("uses direct response delegation guidance for non-orchestrator agents", () => {
    const userMessage = message("message_user_latest", "user", "검토해줘");
    const verifier = {
      ...agent,
      id: "agent_verifier",
      role: "verifier",
      name: "마키세 크리스",
    } satisfies WorkbenchAgent;

    const pipeline = createConversationPipelineMessages({
      agent: verifier,
      configFiles: [],
      memory,
      memoryScope: {
        ...memoryScope,
        agentId: "agent_verifier",
      },
      modelId: "mimo-v2.5-pro",
      previousMessages: [],
      provider,
      systemMessageId: "message_system_pipeline_test",
      userMessage,
    });

    expect(pipeline[0]?.content).toContain(
      "Delegation: respond directly unless the orchestrator/companion explicitly delegated this task to you.",
    );
    expect(pipeline[0]?.content).toContain("SOUL.md: default role profile");
    expect(pipeline[0]?.content).toContain("도구 묶음: 검증 도구");
    expect(pipeline[0]?.content).toContain("허용 도구: test.run, build.check, evidence.check");
  });

  it("does not inject another agent channel's scoped memories", () => {
    const userMessage = message("message_user_latest", "user", "내 기억만 써줘");
    const mixedMemory = {
      trace: {
        id: "trace_memory_mixed_scope",
        results: [
          {
            usedInDecision: true,
            score: 0.96,
            record: {
              title: "다른 에이전트 기억",
              content: "리뷰어에게만 속한 선호.",
              sessionId: "session_main",
              tags: ["agent:agent_reviewer", "provider:provider_mimo_token_openai"],
            },
          },
          {
            usedInDecision: true,
            score: 0.91,
            record: {
              title: "현재 에이전트 기억",
              content: "마키마 채널에 속한 결정.",
              sessionId: "session_main",
              tags: ["agent:agent_orchestrator", "provider:provider_mimo_token_openai"],
            },
          },
        ],
      },
    } as unknown as Stage6MemoryInspector;

    const pipeline = createConversationPipelineMessages({
      agent,
      configFiles: [],
      memory: mixedMemory,
      memoryScope,
      modelId: "mimo-v2.5-pro",
      previousMessages: [],
      provider,
      systemMessageId: "message_system_pipeline_scope_test",
      userMessage,
    });

    expect(pipeline[0]?.content).toContain("현재 에이전트 기억");
    expect(pipeline[0]?.content).not.toContain("다른 에이전트 기억");
    expect(pipeline[0]?.metadata?.recalledMemoryCount).toBe(1);
  });

  it("does not inject untagged memory into every agent channel", () => {
    const userMessage = message("message_user_latest", "user", "내 기억만 써줘");
    const untaggedMemory = {
      trace: {
        id: "trace_memory_untagged",
        results: [
          {
            usedInDecision: true,
            score: 0.99,
            record: {
              title: "소유자 없는 기억",
              content: "아무 agent에게나 들어가면 안 된다.",
            },
          },
          {
            usedInDecision: true,
            score: 0.93,
            record: {
              title: "프로젝트 공용 기억",
              content: "명시적으로 공용 처리된 기억은 허용한다.",
              tags: ["scope:project"],
            },
          },
        ],
      },
    } as unknown as Stage6MemoryInspector;

    const pipeline = createConversationPipelineMessages({
      agent,
      configFiles: [],
      memory: untaggedMemory,
      memoryScope,
      modelId: "mimo-v2.5-pro",
      previousMessages: [],
      provider,
      systemMessageId: "message_system_pipeline_untagged_scope_test",
      userMessage,
    });

    expect(pipeline[0]?.content).not.toContain("소유자 없는 기억");
    expect(pipeline[0]?.content).toContain("프로젝트 공용 기억");
    expect(pipeline[0]?.metadata?.recalledMemoryCount).toBe(1);
  });

  it("warns the agent when older turns were truncated and no scoped recall matched", () => {
    const userMessage = message("message_user_latest", "user", "아까 말한 결정 이어서 해");
    const emptyMemory = {
      trace: {
        id: "trace_memory_empty",
        results: [],
      },
    } as unknown as Stage6MemoryInspector;

    const pipeline = createConversationPipelineMessages({
      agent,
      configFiles: [],
      memory: emptyMemory,
      memoryScope,
      modelId: "mimo-v2.5-pro",
      previousMessages: Array.from({ length: 12 }, (_, index) =>
        message(`message_old_${index}`, index % 2 === 0 ? "user" : "assistant", `오래된 메시지 ${index}`),
      ),
      provider,
      systemMessageId: "message_system_pipeline_truncation_warning_test",
      userMessage,
    });

    expect(pipeline[0]?.content).toContain("Long conversation continuity");
    expect(pipeline[0]?.content).toContain("ask a short clarification");
    expect(pipeline[0]?.metadata?.longContextTruncated).toBe(true);
  });

  it("injects role tool contracts for every seeded agent", () => {
    for (const seededAgent of seededAgentProfiles) {
      const agentUnderTest = {
        ...seededAgent,
        soulMode: "summary",
      } satisfies WorkbenchAgent;
      const scope = createAgentChannelMemoryScope(agentUnderTest.id, "session_main", provider.id);

      const pipeline = createConversationPipelineMessages({
        agent: agentUnderTest,
        configFiles: [],
        memory,
        memoryScope: scope,
        modelId: "mimo-v2.5-pro",
        previousMessages: [],
        provider,
        systemMessageId: `message_system_pipeline_${agentUnderTest.id}`,
        userMessage: message(`message_user_${agentUnderTest.id}`, "user", "상태 알려줘"),
      });

      expect(pipeline[0]?.content).toContain("# 역할 기반 도구 사용 계약");
      expect(pipeline[0]?.content).toContain("- 허용 도구:");
      expect(pipeline[0]?.metadata).toMatchObject({
        agentId: agentUnderTest.id,
        providerProfileId: provider.id,
        modelId: "mimo-v2.5-pro",
        memoryScope: scope.namespace,
        memoryScopeAgentId: agentUnderTest.id,
        memoryScopeProviderProfileId: provider.id,
        memoryScopeSessionId: "session_main",
        recallTraceId: scope.recallTraceId,
        runtimeConfigFileIds: [],
      });
      expect(pipeline[0]?.metadata?.roleToolProfileLabel).toEqual(expect.any(String));
      expect(pipeline[0]?.metadata?.roleToolProfileTools).toEqual(expect.arrayContaining([expect.any(String)]));
    }
  });

  it("redacts persona and recalled memory text before injecting the system prompt", () => {
    const userMessage = message("message_user_latest", "user", "요약해줘");
    const unsafeMemory = {
      trace: {
        id: "trace_memory_unsafe",
        results: [
          {
            usedInDecision: true,
            score: 0.95,
            record: {
              title: "secret https://token-plan-sgp.xiaomimimo.com/v1",
              content: "Bearer sk-1234567890abcdef /Users/robin/private raw prompt: hidden",
              tags: ["scope:project"],
            },
          },
        ],
      },
    } as Stage6MemoryInspector;

    const pipeline = createConversationPipelineMessages({
      agent,
      configFiles: [],
      memory: unsafeMemory,
      memoryScope,
      modelId: "mimo-v2.5-pro",
      persona: {
        ...persona,
        agentsInstruction: "COOKIE=session-secret",
        soulSummary: "PASSWORD=hunter2",
      },
      previousMessages: [],
      provider,
      systemMessageId: "message_system_pipeline_redaction_test",
      userMessage,
    });
    const content = pipeline[0]?.content ?? "";

    expect(content).not.toContain("https://token-plan-sgp.xiaomimimo.com/v1");
    expect(content).not.toContain("sk-1234567890abcdef");
    expect(content).not.toContain("/Users/robin/private");
    expect(content).not.toContain("hidden");
    expect(content).not.toContain("COOKIE=session-secret");
    expect(content).not.toContain("PASSWORD=hunter2");
    expect(content).toContain("[REDACTED:url]");
    expect(content).toContain("Bearer [REDACTED:bearer_token]");
    expect(content).toContain("[REDACTED:path]");
    expect(content).toContain("[REDACTED:internal]");
  });
});
