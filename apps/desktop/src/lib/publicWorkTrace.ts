import type { ConversationMessage, TerminalTimelineBlock } from "@ai-orchestrator/protocol";
import type { Stage3DebateUtteranceView } from "../types";

export type PublicWorkTraceTone = "neutral" | "info" | "success" | "warning" | "danger";

export type PublicWorkTraceItem = {
  id: string;
  label: string;
  value: string;
  tone: PublicWorkTraceTone;
};

export type PublicWorkTraceGroup = {
  id: "steps" | "commands" | "evidence";
  title: "작업 단계" | "명령·도구 제안" | "검증·근거";
  items: PublicWorkTraceItem[];
};

export type PublicWorkTrace = {
  groups: PublicWorkTraceGroup[];
};

const EMPTY_TRACE: PublicWorkTrace = { groups: [] };

export function createConversationMessagePublicWorkTrace(message: ConversationMessage): PublicWorkTrace {
  if (message.role === "user") return EMPTY_TRACE;

  const metadata = message.metadata ?? {};
  const steps: PublicWorkTraceItem[] = [];
  const commands: PublicWorkTraceItem[] = [];
  const evidence: PublicWorkTraceItem[] = [];

  const route = readString(metadata.route) ?? readString(metadata.providerRoute) ?? readString(metadata.providerProfileId);
  const model = readString(metadata.modelId);
  const realProviderCall = readBoolean(metadata.realProviderCall);
  if (route || model || realProviderCall !== undefined) {
    steps.push({
      id: "provider-call",
      label: "Provider 호출",
      tone: realProviderCall === false ? "warning" : "success",
      value: sanitize([route, model].filter(Boolean).join(" · ") || (realProviderCall ? "실제 호출 완료" : "fallback 또는 차단")),
    });
  }

  const error = readString(metadata.error) ?? readString(metadata.fallbackReason);
  if (error) {
    steps.push({
      id: "runtime-warning",
      label: "실행 경고",
      tone: "danger",
      value: sanitize(error),
    });
  }

  const runtimeConfigFileIds = readStringArray(metadata.runtimeConfigFileIds);
  if (runtimeConfigFileIds.length > 0) {
    commands.push({
      id: "runtime-config",
      label: "런타임 규칙",
      tone: "info",
      value: sanitize(`${runtimeConfigFileIds.length}개 config 적용`),
    });
  }

  for (const [index, delegation] of readDelegations(metadata)) {
    commands.push({
      id: `delegation-${index}`,
      label: "위임 제안",
      tone: delegation.status === "failed" || delegation.status === "blocked" ? "warning" : "info",
      value: sanitize(`${delegation.target} · ${delegation.status}`),
    });
  }

  const memoryScope = readString(metadata.memoryScope);
  if (memoryScope) {
    evidence.push({
      id: "memory-scope",
      label: "기억 범위",
      tone: "neutral",
      value: sanitize(memoryScope),
    });
  }

  const recallTraceId = readString(metadata.recallTraceId);
  const recalledMemoryCount = readNumber(metadata.recalledMemoryCount);
  if (recallTraceId || recalledMemoryCount !== undefined) {
    evidence.push({
      id: "memory-recall",
      label: "기억 조회",
      tone: "success",
      value: sanitize(
        `${recalledMemoryCount ?? 0}개 recall${recallTraceId ? ` · ${recallTraceId}` : ""}`,
      ),
    });
  }

  return toTrace(steps, commands, evidence);
}

export function createDebateUtterancePublicWorkTrace(utterance: Stage3DebateUtteranceView): PublicWorkTrace {
  const steps: PublicWorkTraceItem[] = [
    {
      id: "debate-stage",
      label: "토론 단계",
      tone: "info",
      value: sanitize(`${utterance.roundTitle} · ${roleDisplayLabel(utterance.agentRole)}`),
    },
  ];
  const commands: PublicWorkTraceItem[] = utterance.codingImpactRefs?.length
    ? [
        {
          id: "coding-impact",
          label: "코딩 영향",
          tone: "warning",
          value: sanitize(`${utterance.codingImpactRefs.length}개 coding ref`),
        },
      ]
    : [];
  const evidence: PublicWorkTraceItem[] = [
    {
      id: "debate-tags",
      label: "태그",
      tone: "neutral",
      value: sanitize(utterance.tags.join(", ") || "없음"),
    },
  ];

  if (utterance.evidenceRefIds?.length) {
    evidence.push({
      id: "debate-evidence",
      label: "근거",
      tone: "success",
      value: sanitize(`${utterance.evidenceRefIds.length}개 evidence ref`),
    });
  }

  return toTrace(steps, commands, evidence);
}

export function createTerminalBlockPublicWorkTrace(block: TerminalTimelineBlock): PublicWorkTrace {
  const steps: PublicWorkTraceItem[] = [
    {
      id: "tmux-step",
      label: "tmux 단계",
      tone: block.status === "failed" || block.status === "blocked" ? "danger" : "info",
      value: sanitize(`${block.kind} · ${block.status}`),
    },
  ];
  const commands: PublicWorkTraceItem[] = [];
  if (block.kind === "command_intent" || block.kind === "dispatch" || block.kind === "dry_run") {
    commands.push({
      id: "tmux-command",
      label: "명령",
      tone: block.status === "completed" ? "success" : "warning",
      value: sanitize(block.title),
    });
  }
  const evidence: PublicWorkTraceItem[] = [];
  if (block.summary) {
    evidence.push({
      id: "tmux-summary",
      label: "결과",
      tone: block.status === "failed" ? "danger" : "neutral",
      value: sanitize(block.summary),
    });
  }
  if (block.outputPreview) {
    evidence.push({
      id: "tmux-output",
      label: "출력",
      tone: block.redactionApplied ? "success" : "warning",
      value: sanitize(block.outputPreview),
    });
  }
  return toTrace(steps, commands, evidence);
}

function toTrace(
  steps: PublicWorkTraceItem[],
  commands: PublicWorkTraceItem[],
  evidence: PublicWorkTraceItem[],
): PublicWorkTrace {
  const groups: PublicWorkTraceGroup[] = [];
  if (steps.length > 0) groups.push({ id: "steps", items: steps, title: "작업 단계" });
  if (commands.length > 0) groups.push({ id: "commands", items: commands, title: "명령·도구 제안" });
  if (evidence.length > 0) groups.push({ id: "evidence", items: evidence, title: "검증·근거" });
  return { groups };
}

function readDelegations(metadata: Record<string, unknown>) {
  const raw = metadata.delegationTags ?? metadata.delegations;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const target = readString(record.target);
    if (!target) return [];
    return [
      [
        index,
        {
          status: readString(record.status) ?? readString(record.kind) ?? "detected",
          target,
        },
      ] as const,
    ];
  });
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function roleDisplayLabel(role: string) {
  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function sanitize(value: string) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[redacted]")
    .replace(/\btp-[A-Za-z0-9_-]{8,}\b/g, "[redacted]")
    .replace(/\b[A-Za-z0-9_]*(?:TOKEN|SECRET|API_KEY|PASSWORD)[A-Za-z0-9_]*=[^\s]+/gi, "[redacted]");
}
