import type { ConversationMessage } from "@ai-orchestrator/protocol";
import type { Stage6MemoryInspector } from "../runtime/stage6Memory";
import { createConversationPipelineMessages } from "../runtime/conversationPipeline";
import type { WorkbenchAgent } from "../types";
import { createAgentChannelMemoryScope } from "./agentConversationChannels";
import { agentPrimaryDisplayName } from "./agentDisplay";
import { getBundledAgentPersonaContent } from "./agentPersonaContent";
import { getAgentToolBadgeLabels } from "./agentToolProfiles";
import { createDefaultPersonaSettings } from "./helpers";

const smokeCreatedAt = "2026-06-06T00:00:00.000Z";
const smokeProvider = {
  id: "provider_mimo_token_openai",
  name: "MiMo Token Plan OpenAI",
};
const smokeModelId = "mimo-v2.5-pro";

export type AgentConversationSmokeResult = {
  agentId: string;
  agentsLoaded: boolean;
  crossAgentMemoryBlocked: boolean;
  displayName: string;
  failures: string[];
  identityContractBound: boolean;
  memoryNamespace: string;
  personaDirectory: string;
  scopedMemoryBound: boolean;
  soulLoaded: boolean;
  toolBadges: string[];
  toolContractBound: boolean;
};

export function createAgentConversationSmokeResults(agents: WorkbenchAgent[]): AgentConversationSmokeResult[] {
  return agents.map((agent) => {
    const otherAgentId = agents.find((candidate) => candidate.id !== agent.id)?.id ?? "agent_other";
    const displayName = agentPrimaryDisplayName(agent);
    const personaDirectory = agent.personaName ?? agent.role;
    const personaContent = getBundledAgentPersonaContent(personaDirectory);
    const memoryScope = createAgentChannelMemoryScope(agent.id, "session_smoke", smokeProvider.id);
    const ownMemoryTitle = `smoke-own-memory-${agent.id}`;
    const otherMemoryTitle = `smoke-other-memory-${agent.id}`;
    const memory = createSmokeMemory(agent.id, otherAgentId, ownMemoryTitle, otherMemoryTitle);
    const userMessage = createSmokeMessage(`message_user_${agent.id}`, "상태 점검");
    const pipeline = createConversationPipelineMessages({
      agent,
      configFiles: [],
      memory,
      memoryScope,
      modelId: smokeModelId,
      persona: createDefaultPersonaSettings(agent),
      previousMessages: [],
      provider: smokeProvider,
      systemMessageId: `message_system_smoke_${agent.id}`,
      userMessage,
    });
    const systemContent = pipeline[0]?.content ?? "";
    const toolBadges = getAgentToolBadgeLabels(agent.role);

    const result: AgentConversationSmokeResult = {
      agentId: agent.id,
      agentsLoaded: Boolean(personaContent?.agentsMd) && systemContent.includes("AGENTS.md operational rules:"),
      crossAgentMemoryBlocked: !systemContent.includes(otherMemoryTitle),
      displayName,
      failures: [],
      identityContractBound:
        systemContent.includes(`Identity contract: your name is ${displayName}`) &&
        systemContent.includes(`Agent: ${displayName} / role: ${agent.role}`),
      memoryNamespace: memoryScope.namespace,
      personaDirectory,
      scopedMemoryBound:
        systemContent.includes(ownMemoryTitle) &&
        systemContent.includes(`namespace=${memoryScope.namespace}`) &&
        systemContent.includes(memoryScope.recallTraceId),
      soulLoaded: Boolean(personaContent?.soulMd) && systemContent.includes("SOUL.md content:"),
      toolBadges,
      toolContractBound:
        systemContent.includes("# 역할 기반 도구 사용 계약") &&
        systemContent.includes("- 허용 도구:") &&
        toolBadges.length > 0,
    };

    result.failures = createSmokeFailures(result);
    return result;
  });
}

function createSmokeMessage(id: string, content: string): ConversationMessage {
  return {
    id,
    content,
    createdAt: smokeCreatedAt,
    role: "user",
    sessionId: "session_smoke",
  };
}

function createSmokeMemory(
  agentId: string,
  otherAgentId: string,
  ownMemoryTitle: string,
  otherMemoryTitle: string,
): Stage6MemoryInspector {
  return {
    trace: {
      id: `memory_trace_smoke_${agentId}`,
      results: [
        {
          usedInDecision: true,
          score: 0.97,
          record: {
            title: ownMemoryTitle,
            content: "현재 에이전트 전용 장기 기억입니다.",
            sessionId: "session_smoke",
            tags: [`agent:${agentId}`, `provider:${smokeProvider.id}`],
          },
        },
        {
          usedInDecision: true,
          score: 0.96,
          record: {
            title: otherMemoryTitle,
            content: "다른 에이전트 기억이며 현재 프롬프트에 들어가면 안 됩니다.",
            sessionId: "session_smoke",
            tags: [`agent:${otherAgentId}`, `provider:${smokeProvider.id}`],
          },
        },
      ],
    },
  } as Stage6MemoryInspector;
}

function createSmokeFailures(result: Omit<AgentConversationSmokeResult, "failures">): string[] {
  const failures: string[] = [];
  if (!result.soulLoaded) failures.push("SOUL.md 본문 누락");
  if (!result.agentsLoaded) failures.push("AGENTS.md 본문 누락");
  if (!result.identityContractBound) failures.push("캐릭터 이름 identity contract 누락");
  if (!result.scopedMemoryBound) failures.push("에이전트 전용 기억 scope 누락");
  if (!result.crossAgentMemoryBlocked) failures.push("다른 에이전트 기억 격리 실패");
  if (!result.toolContractBound) failures.push("역할별 도구 계약 누락");
  return failures;
}
