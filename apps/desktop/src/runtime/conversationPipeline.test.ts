import { describe, expect, it } from "vitest";
import type { ConversationMessage } from "@ai-orchestrator/protocol";
import type {
  AgentConfigFile,
  AgentPersonaSettings,
  WorkbenchAgent,
} from "../types";
import type { AgentChannelMemoryScope } from "../lib/agentConversationChannels";
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
  soulExampleDialogue: "",
  agentsInstruction: "한국어로 지휘한다.",
  forbiddenStyle: "",
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
        },
      },
      {
        usedInDecision: false,
        score: 0.5,
        record: {
          title: "미사용 기억",
          content: "이 문장은 들어가면 안 된다.",
        },
      },
    ],
  },
} as Stage6MemoryInspector;

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
    expect(pipeline[0]?.content).toContain("Agent: 마키마 / role: orchestrator");
    expect(pipeline[0]?.content).toContain("Provider: MiMo Token Plan / model: mimo-v2.5-pro");
    expect(pipeline[0]?.content).toContain("총괄 지휘자");
    expect(pipeline[0]?.content).toContain(`namespace=${memoryScope.namespace}`);
    expect(pipeline[0]?.content).toContain(memoryScope.recallTraceId);
    expect(pipeline[0]?.content).toContain("역할별 도구 호출 프로필");
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
  });
});
