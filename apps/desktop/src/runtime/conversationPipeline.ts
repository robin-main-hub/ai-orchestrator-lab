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
import { evaluateAnswerability } from "../lib/answerabilityGuard";
import { detectEntityAmbiguity } from "../lib/ambiguityGuard";
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
  /** plan = read-only investigation; mutating tools are blocked (item 4) */
  agentMode?: "build" | "plan";
  /** auto-compaction summary of older turns, injected into the system prompt (item 6) */
  condensedSummary?: string;
  /** enable the ```tool fence instruction block (item 2) */
  toolLoopEnabled?: boolean;
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
  agentMode,
  condensedSummary,
  toolLoopEnabled,
}: CreateConversationPipelineMessagesInput): ConversationMessage[] {
  const scopedResults = memory.trace.results.filter(
    (result) => result.usedInDecision && memoryResultMatchesScope(result, memoryScope),
  );
  // 패치 P2: 내용 기반(부스트 제외) 점수로 답변가능성 판정 — 핀고정 무관 기억 차단
  const answerability = evaluateAnswerability(scopedResults);
  // 패치 P3: 비슷한 점수의 서로 다른 엔티티 기억이 섞이면 모호 — 단정 대신 되묻게
  const ambiguity = detectEntityAmbiguity(answerability.groundedResults);
  const recalledMemories = answerability.groundedResults
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
    longContextTruncated && recalledMemories.length === 0 && answerability.answerable
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
    answerability.answerable && recalledMemories.length > 0
      ? `EvolveMemento recall:\n${recalledMemories.join("\n")}`
      : answerability.idkDirective ?? "EvolveMemento recall: no selected records",
    ambiguity.ambiguous ? ambiguity.directive : undefined,
    attachmentContext,
    continuityWarning,
    condensedSummary?.trim()
      ? `이전 대화 자동 압축 요약 (오래된 턴은 프롬프트에서 제외됨):\n${sanitizePipelineText(condensedSummary)}`
      : undefined,
    toolLoopEnabled ? createToolLoopInstruction(agentMode) : undefined,
    agentMode === "plan"
      ? "지금은 PLAN 모드입니다: bash/write/edit 같은 변경 도구는 실행되지 않습니다. 읽기·분석·계획만 수행하세요."
      : undefined,
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
      agentMode: agentMode ?? "build",
      toolLoopEnabled: Boolean(toolLoopEnabled),
      condensedSummaryApplied: Boolean(condensedSummary?.trim()),
    },
  };

  return [systemMessage, ...previousMessages.slice(-8), userMessage];
}

function createToolLoopInstruction(agentMode?: "build" | "plan"): string {
  return [
    "도구 사용 (워크스페이스 작업): 파일/저장소 작업이 필요하면 답변 안에 아래 형식의 tool 펜스를 포함한다.",
    "```tool",
    '{"tool":"bash","command":"ls -la"}',
    "```",
    '사용 가능 도구: bash{"command"}, read{"path"}, grep{"pattern","path"?}, glob{"pattern"}, write{"path","content"}, edit{"path","oldText","newText"}, todo{"items":[]}.',
    "모든 도구는 사용자 승인 게이트를 거쳐 실행되며, 결과는 다음 사용자 턴에 [tool_result ...] 블록으로 전달된다.",
    "결과를 받기 전에는 실행이 완료됐다고 주장하지 않는다. 결과가 충분하면 도구 호출 없이 텍스트로 결론을 정리한다.",
    agentMode === "plan"
      ? "PLAN 모드에서는 bash/write/edit가 거부되므로 read/grep/glob/todo만 제안한다."
      : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

/** prompt budget per inlined text attachment — attachments already cap at 64K on read */
const ATTACHMENT_INLINE_CHAR_LIMIT = 12_000;

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

  const contentBlocks: string[] = [];
  let metadataOnlyCount = 0;

  const attachmentLines = attachments.slice(0, 8).map((attachment, index) => {
    const name = sanitizePipelineText(readMetadataString(attachment.name, `attachment_${index + 1}`));
    const kind = sanitizePipelineText(readMetadataString(attachment.kind, "unknown"));
    const storage = sanitizePipelineText(readMetadataString(attachment.storage, "metadata_only"));
    const dataUrl = typeof attachment.dataUrl === "string" ? attachment.dataUrl : "";
    const textContent = typeof attachment.textContent === "string" ? attachment.textContent : "";

    if (dataUrl.startsWith("data:")) {
      return `${index + 1}. ${name} · kind=${kind} · 이미지 바이트가 이 요청에 동봉됨 (비전 입력으로 직접 볼 수 있음)`;
    }
    if (textContent.trim()) {
      const truncatedAtRead = attachment.truncated === true;
      const overPromptBudget = textContent.length > ATTACHMENT_INLINE_CHAR_LIMIT;
      const inlined = overPromptBudget ? textContent.slice(0, ATTACHMENT_INLINE_CHAR_LIMIT) : textContent;
      const truncationNote = truncatedAtRead || overPromptBudget ? " (일부만 — 원본이 더 김)" : "";
      contentBlocks.push(
        [`--- 첨부 본문: ${name}${truncationNote} ---`, sanitizePipelineText(inlined), "--- 첨부 본문 끝 ---"].join("\n"),
      );
      return `${index + 1}. ${name} · kind=${kind} · 본문이 아래에 인라인됨${truncationNote}`;
    }
    metadataOnlyCount += 1;
    return `${index + 1}. ${name} · kind=${kind} · storage=${storage} · 메타데이터만 (바이트 미전달)`;
  });

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

  const lines = attachmentLines.length > 0 ? attachmentLines : planLines;
  const disclaimer =
    metadataOnlyCount > 0 || attachmentLines.length === 0
      ? "메타데이터만 전달된 첨부가 있음 — 해당 파일 바이트는 아직 모델에 직접 전달되지 않음. 그 첨부 내용을 보았다고 주장하지 말고, 필요한 경우 추가 추출/권한을 요청한다."
      : undefined;
  const planSection =
    attachmentLines.length > 0 && planLines.length > 0 ? ["처리 계획:", ...planLines] : [];

  return ["첨부 컨텍스트:", disclaimer, ...lines, ...planSection, ...contentBlocks]
    .filter(Boolean)
    .join("\n");
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
