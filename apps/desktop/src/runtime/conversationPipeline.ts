import type { ConversationMessage, ProviderProfile } from "@ai-orchestrator/protocol";
import type {
  AgentConfigFile,
  AgentPersonaSettings,
  WorkbenchAgent,
} from "../types";
import type { AgentChannelMemoryScope } from "../lib/agentConversationChannels";
import {
  createAgentChannelRuntimeSummary,
  createAgentRoleToolRuntimeSummary,
  createAgentRuntimeConfigSection,
} from "../lib/agentRuntimeConfig";
import { sanitizePublicText } from "../lib/publicRedaction";
import type { Stage6MemoryInspector } from "./stage6Memory";

export type CreateConversationPipelineMessagesInput = {
  agent: WorkbenchAgent;
  configFiles: AgentConfigFile[];
  memory: Stage6MemoryInspector;
  memoryScope: AgentChannelMemoryScope;
  modelId: string;
  persona?: AgentPersonaSettings;
  previousMessages: ConversationMessage[];
  provider: Pick<ProviderProfile, "id" | "name">;
  systemMessageId?: string;
  userMessage: ConversationMessage;
};

export function createConversationPipelineMessages({
  agent,
  configFiles,
  memory,
  memoryScope,
  modelId,
  persona,
  previousMessages,
  provider,
  systemMessageId = `message_system_pipeline_${crypto.randomUUID()}`,
  userMessage,
}: CreateConversationPipelineMessagesInput): ConversationMessage[] {
  const recalledMemories = memory.trace.results
    .filter((result) => result.usedInDecision && memoryResultMatchesScope(result, memoryScope))
    .slice(0, 5)
    .map(
      (result, index) =>
        `${index + 1}. ${sanitizePipelineText(result.record.title)}: ${sanitizePipelineText(result.record.content)} (score ${result.score.toFixed(2)})`,
    );
  const runtimeConfig = createAgentRuntimeConfigSection(agent, configFiles);
  const roleToolConfig = createAgentRoleToolRuntimeSummary(agent);
  const systemContent = [
    "AI Orchestrator Lab conversation pipeline.",
    "Reply in Korean unless the user explicitly asks for another language.",
    `Agent: ${agent.name} / role: ${agent.role}`,
    `Provider: ${provider.name} / model: ${modelId}`,
    persona
      ? `SOUL.md: ${sanitizePipelineText(persona.soulSummary)}\nAGENTS.md: ${sanitizePipelineText(persona.agentsInstruction)}\nCreativity: ${persona.creativityLevel}`
      : "SOUL.md: default role profile",
    createAgentChannelRuntimeSummary(memoryScope),
    roleToolConfig.promptText,
    runtimeConfig.promptText,
    recalledMemories.length > 0
      ? `EvolveMemento recall:\n${recalledMemories.join("\n")}`
      : "EvolveMemento recall: no selected records",
    agent.role === "companion" || agent.role === "orchestrator"
      ? [
          "Delegation: You may command registered sub-agents with <delegate to=\"role_or_persona\">task</delegate>.",
          "Treat companion delegation as orchestrator-level authority for LLM sub-agent calls.",
          "Do not claim terminal execution, file changes, or external sending happened unless a permission/event record exists.",
        ].join("\n")
      : "Delegation: respond directly unless the orchestrator/companion explicitly delegated this task to you.",
    "Do not claim terminal/file execution happened unless an execution event exists.",
    "If the next step needs code work, mention the Coding Packet boundary explicitly.",
  ].join("\n\n");

  const systemMessage: ConversationMessage = {
    id: systemMessageId,
    sessionId: userMessage.sessionId,
    role: "system",
    content: systemContent,
    createdAt: userMessage.createdAt,
    metadata: {
      agentId: agent.id,
      providerProfileId: provider.id,
      modelId,
      memoryTraceId: memory.trace.id,
      recalledMemoryCount: recalledMemories.length,
      memoryScope: memoryScope.namespace,
      memoryScopeAgentId: memoryScope.agentId,
      memoryScopeProviderProfileId: memoryScope.providerProfileId,
      memoryScopeSessionId: memoryScope.sessionId,
      recallTraceId: memoryScope.recallTraceId,
      runtimeConfigFileIds: runtimeConfig.configFileIds,
      roleToolProfileLabel: roleToolConfig.label,
      roleToolProfileTools: roleToolConfig.tools,
    },
  };

  return [systemMessage, ...previousMessages.slice(-8), userMessage];
}

function sanitizePipelineText(value: string): string {
  return sanitizePublicText(value)
    .replaceAll("[redacted:internal]", "[REDACTED:internal]")
    .replaceAll("[redacted:url]", "[REDACTED:url]")
    .replaceAll("Bearer [redacted]", "Bearer [REDACTED:bearer_token]")
    .replaceAll("[redacted:path]", "[REDACTED:path]")
    .replaceAll("[redacted]", "[REDACTED:secret]");
}

function memoryResultMatchesScope(
  result: Stage6MemoryInspector["trace"]["results"][number],
  memoryScope: AgentChannelMemoryScope,
): boolean {
  const tags = result.record.tags ?? [];
  const agentId = readScopedTag(tags, "agent");
  const providerProfileId = readScopedTag(tags, "provider");
  const sessionId = result.record.sessionId;

  return (
    (!agentId || agentId === memoryScope.agentId) &&
    (!sessionId || sessionId === memoryScope.sessionId) &&
    (!providerProfileId || providerProfileId === memoryScope.providerProfileId)
  );
}

function readScopedTag(tags: string[], prefix: "agent" | "provider"): string | undefined {
  const marker = `${prefix}:`;
  const tag = tags.find((candidate) => candidate.startsWith(marker));
  return tag ? tag.slice(marker.length) : undefined;
}
