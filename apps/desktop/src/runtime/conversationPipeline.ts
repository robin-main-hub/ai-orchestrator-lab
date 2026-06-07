import {
  buildPersonaPromptFragment,
  type PersonaFragment,
} from "@ai-orchestrator/agents";
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
import { agentIdentityKey, agentPrimaryDisplayName } from "../lib/agentDisplay";
import {
  getBundledAgentPersonaContent,
  getBundledAgentPersonaContentByPath,
  getBundledAgentSafetyContent,
} from "../lib/agentPersonaContent";
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
  const displayName = agentPrimaryDisplayName(agent);
  const personaInjectionDisabled = agent.configSource === "off" || agent.soulMode === "off";
  const personaInjectionEnabled = Boolean(persona && !personaInjectionDisabled);
  const bundledSoulMd = personaInjectionEnabled ? getBundledAgentPersonaContentByPath(persona?.soulMdPath) : undefined;
  const bundledAgentsMd = personaInjectionEnabled ? getBundledAgentPersonaContentByPath(persona?.agentsMdPath) : undefined;
  const soulPromptText = bundledSoulMd ?? persona?.soulSummary;
  const agentsPromptText = bundledAgentsMd ?? persona?.agentsInstruction;
  const personaSoulApplied = Boolean(personaInjectionEnabled && soulPromptText?.trim());
  const personaAgentsMdApplied = Boolean(personaInjectionEnabled && agentsPromptText?.trim());
  const personaFragment = createConversationPersonaFragment({
    agent,
    agentsPromptText: personaInjectionEnabled ? agentsPromptText : undefined,
    persona: personaInjectionEnabled ? persona : undefined,
    soulPromptText: personaInjectionEnabled ? soulPromptText : undefined,
  });
  const attachmentContext = createAttachmentContext(userMessage);
  const longContextTruncated = previousMessages.length > 8;
  const continuityWarning =
    longContextTruncated && recalledMemories.length === 0
      ? [
          "Long conversation continuity: older turns were compacted out of the live prompt and no EvolveMemento recall matched this agent scope.",
          "If the answer depends on earlier context, ask a short clarification instead of inventing missing details.",
        ].join("\n")
      : undefined;
  const systemContent = [
    "AI Orchestrator Lab conversation pipeline.",
    "Reply in Korean unless the user explicitly asks for another language.",
    personaInjectionEnabled
      ? "The active agent persona is binding: preserve its SOUL.md voice, judgment style, and forbidden style while staying concise and truthful."
      : personaInjectionDisabled
        ? "The active agent identity is binding, but SOUL/AGENTS body injection is disabled for this run."
        : "The active agent role profile is binding; use the role contract and memory scope without inventing missing SOUL text.",
    `Identity contract: your name is ${displayName}. If the user asks your name, answer ${displayName}; do not say you have no name and do not replace it with only the role.`,
    `Name QA contract: when the user asks "네 이름은 뭐야", "이름", "누구야", or similar identity questions, answer first as "${displayName}" and then explain your role only if useful.`,
    `Agent: ${displayName} / role: ${agent.role}`,
    agent.name !== displayName ? `Legacy profile label: ${sanitizePipelineText(agent.name)}` : undefined,
    `Provider: ${provider.name} / model: ${modelId}`,
    personaInjectionEnabled && persona
      ? [
          personaFragment.promptText ? `Official persona fragment:\n${sanitizePipelineText(personaFragment.promptText)}` : undefined,
          `SOUL.md path: ${sanitizePipelineText(persona.soulMdPath)}`,
          `SOUL.md content:\n${sanitizePipelineText(soulPromptText ?? persona.soulSummary)}`,
          persona.soulExampleDialogue
            ? `SOUL.md example dialogue:\n${sanitizePipelineText(persona.soulExampleDialogue)}`
            : undefined,
          `AGENTS.md path: ${sanitizePipelineText(persona.agentsMdPath)}`,
          `AGENTS.md operational rules:\n${sanitizePipelineText(agentsPromptText ?? persona.agentsInstruction)}`,
          `Voice preset: ${persona.voicePreset}`,
          `Creativity: ${persona.creativityLevel}`,
          persona.forbiddenStyle
            ? `Forbidden style: ${sanitizePipelineText(persona.forbiddenStyle)}`
            : undefined,
        ].filter(Boolean).join("\n")
      : persona
        ? "SOUL/AGENTS injection: disabled for this run"
        : "SOUL.md: default role profile",
    createAgentChannelRuntimeSummary(memoryScope),
    roleToolConfig.promptText,
    runtimeConfig.promptText,
    recalledMemories.length > 0
      ? `EvolveMemento recall:\n${recalledMemories.join("\n")}`
      : "EvolveMemento recall: no selected records",
    attachmentContext,
    continuityWarning,
    agent.role === "companion" || agent.role === "orchestrator"
      ? [
          "Delegation: You may command registered sub-agents with <delegate to=\"role_or_persona\">task</delegate>.",
          "Treat companion delegation as orchestrator-level authority for LLM sub-agent calls.",
          "Do not claim terminal execution, file changes, or external sending happened unless a permission/event record exists.",
        ].join("\n")
    : "Delegation: respond directly unless the orchestrator/companion explicitly delegated this task to you.",
    "Do not claim terminal/file execution happened unless an execution event exists.",
    "If the next step needs code work, mention the Coding Packet boundary explicitly.",
  ].filter(Boolean).join("\n\n");

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
      longContextTruncated,
      memoryScope: memoryScope.namespace,
      memoryScopeAgentId: memoryScope.agentId,
      memoryScopeProviderProfileId: memoryScope.providerProfileId,
      memoryScopeSessionId: memoryScope.sessionId,
      recallTraceId: memoryScope.recallTraceId,
      runtimeConfigFileIds: runtimeConfig.configFileIds,
      personaDisplayName: displayName,
      personaIdentityKey: agentIdentityKey(agent),
      personaSoulApplied,
      personaAgentsMdApplied,
      personaSafetyApplied: personaFragment.safetyApplied,
      personaFragmentsInjected: personaFragment.fragmentsInjected,
      personaSoulMdPath: personaInjectionEnabled ? persona?.soulMdPath : undefined,
      personaAgentsMdPath: personaInjectionEnabled ? persona?.agentsMdPath : undefined,
      roleToolProfileLabel: roleToolConfig.label,
      roleToolProfileTools: roleToolConfig.tools,
    },
  };

  return [systemMessage, ...previousMessages.slice(-8), userMessage];
}

function createAttachmentContext(userMessage: ConversationMessage): string | undefined {
  const metadata = userMessage.metadata as
    | {
        attachments?: Array<Record<string, unknown>>;
        attachmentProcessingPlans?: Array<Record<string, unknown>>;
      }
    | undefined;
  const attachments = Array.isArray(metadata?.attachments) ? metadata.attachments : [];
  const plans = Array.isArray(metadata?.attachmentProcessingPlans) ? metadata.attachmentProcessingPlans : [];

  if (attachments.length === 0 && plans.length === 0) {
    return undefined;
  }

  const planLines = plans.slice(0, 8).map((plan, index) => {
    const name = sanitizePipelineText(readMetadataString(plan.name, `attachment_${index + 1}`));
    const kind = sanitizePipelineText(readMetadataString(plan.kind, "unknown"));
    const mode = sanitizePipelineText(readMetadataString(plan.processingMode, "metadata_only"));
    const storage = sanitizePipelineText(readMetadataString(plan.storage, "metadata_only"));
    const status = sanitizePipelineText(readMetadataString(plan.status, "unknown"));
    const reason = readMetadataString(plan.reason, "");
    const reasonText = reason ? ` · 사유=${sanitizePipelineText(reason)}` : "";
    return `${index + 1}. ${name} · kind=${kind} · mode=${mode} · storage=${storage} · status=${status}${reasonText}`;
  });

  const attachmentLines =
    planLines.length > 0
      ? planLines
      : attachments.slice(0, 8).map((attachment, index) => {
          const name = sanitizePipelineText(readMetadataString(attachment.name, `attachment_${index + 1}`));
          const kind = sanitizePipelineText(readMetadataString(attachment.kind, "unknown"));
          const storage = sanitizePipelineText(readMetadataString(attachment.storage, "metadata_only"));
          return `${index + 1}. ${name} · kind=${kind} · storage=${storage}`;
        });

  return [
    "첨부 컨텍스트:",
    "파일 바이트는 아직 모델에 직접 전달되지 않음. 첨부 내용을 보았다고 주장하지 말고, 필요한 경우 추가 추출/권한을 요청한다.",
    ...attachmentLines,
  ].join("\n");
}

function readMetadataString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function createConversationPersonaFragment({
  agent,
  agentsPromptText,
  persona,
  soulPromptText,
}: {
  agent: WorkbenchAgent;
  agentsPromptText?: string;
  persona?: AgentPersonaSettings;
  soulPromptText?: string;
}) {
  if (!persona) {
    return { fragmentsInjected: [] as string[], promptText: "", safetyApplied: false };
  }

  const personaName = readPersonaNameFromPath(persona.soulMdPath) ?? agent.personaName ?? agent.role;
  const bundled = getBundledAgentPersonaContent(personaName);
  const fragments: PersonaFragment[] = [];

  if (bundled?.identityMd) {
    fragments.push({
      source: "identity",
      relativePath: `agents/${personaName}/IDENTITY.md`,
      content: bundled.identityMd,
    });
  }
  if (soulPromptText?.trim()) {
    fragments.push({
      source: "soul",
      relativePath: persona.soulMdPath,
      content: soulPromptText,
    });
  }
  if (agentsPromptText?.trim()) {
    fragments.push({
      source: "agents",
      relativePath: persona.agentsMdPath,
      content: agentsPromptText,
    });
  }
  if (bundled?.userMd) {
    fragments.push({
      source: "user",
      relativePath: `agents/${personaName}/USER.md`,
      content: bundled.userMd,
    });
  }

  const safetyContent = getBundledAgentSafetyContent() ?? null;
  return {
    fragmentsInjected: fragments.map((fragment) => fragment.relativePath),
    promptText: buildPersonaPromptFragment({
      fragments,
      mode: "soul_plus_agents",
      personaName,
      safetyContent,
    }),
    safetyApplied: Boolean(safetyContent),
  };
}

function readPersonaNameFromPath(path: string | undefined) {
  return path?.match(/agents\/([^/]+)\//)?.[1];
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
  const isPublicMemory = tags.includes("scope:global") || tags.includes("scope:project");

  if (!agentId && !sessionId && !providerProfileId) {
    return isPublicMemory;
  }

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
