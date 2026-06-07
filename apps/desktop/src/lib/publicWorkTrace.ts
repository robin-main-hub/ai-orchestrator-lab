import type { ConversationMessage, TerminalTimelineBlock } from "@ai-orchestrator/protocol";
import type { Stage3DebateUtteranceView } from "../types";
import { compactPublicText, inspectPublicText, sanitizePublicText } from "./publicRedaction";

export type PublicWorkTraceTone = "neutral" | "info" | "success" | "warning" | "danger";

export type PublicWorkTraceItem = {
  id: string;
  label: string;
  value: string;
  tone: PublicWorkTraceTone;
};

export type PublicWorkTraceGroup = {
  id: "steps" | "commands" | "evidence";
  title: "작업 단계" | "도구 후보" | "검증";
  items: PublicWorkTraceItem[];
};

export type PublicWorkTraceReceipt = {
  label: "에이전트 실행 영수증" | "토론 실행 영수증" | "Tmux 실행 영수증";
  status: "checkpointed" | "live" | "fallback" | "blocked";
  items: Array<{
    label: "범위" | "기준점" | "마스킹" | "공개 범위";
    value: string;
  }>;
};

export type PublicWorkReceiptSummary = {
  compactLabel: string;
  detailItems: Array<{
    label: PublicWorkTraceReceipt["items"][number]["label"];
    value: string;
  }>;
  statusLabel: string;
};

export type PublicWorkTrace = {
  groups: PublicWorkTraceGroup[];
  receipt?: PublicWorkTraceReceipt;
};

const EMPTY_TRACE: PublicWorkTrace = { groups: [] };
const FORBIDDEN_PUBLIC_TRACE_PATTERNS = [
  /https?:\/\/[^\s"')]+/i,
  /Bearer\s+[A-Za-z0-9._~+/=-]+/i,
  /sk-[A-Za-z0-9_-]{8,}/i,
  /tp-[A-Za-z0-9_-]{8,}/i,
  /\/Users\/[^\s"')]+/i,
  /(?:chain[- ]of[- ]thought|raw prompt|tool input|command args?)\s*:/i,
];

export type PublicTraceSafetyReport = {
  blockedReasons: string[];
  isSafe: boolean;
  label: string;
};

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

  const totalTokens = readUsageTotalTokens(metadata.usage);
  if (totalTokens !== undefined) {
    steps.push({
      id: "token-usage",
      label: "토큰 사용",
      tone: "neutral",
      value: sanitize(`${totalTokens} total tokens`),
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

  const personaDisplayName = readString(metadata.personaDisplayName);
  const personaSoulApplied = readBoolean(metadata.personaSoulApplied);
  const personaAgentsMdApplied = readBoolean(metadata.personaAgentsMdApplied);
  if (personaDisplayName || personaSoulApplied !== undefined || personaAgentsMdApplied !== undefined) {
    const appliedLabels = [
      personaSoulApplied ? "SOUL.md 적용" : personaSoulApplied === false ? "SOUL.md 대기" : undefined,
      personaAgentsMdApplied ? "AGENTS.md 적용" : personaAgentsMdApplied === false ? "AGENTS.md 대기" : undefined,
    ].filter(Boolean);
    commands.push({
      id: "persona-config",
      label: "인격 설정",
      tone: personaSoulApplied && personaAgentsMdApplied ? "success" : "warning",
      value: sanitize(
        [personaDisplayName, appliedLabels.length > 0 ? appliedLabels.join(" · ") : "설정 확인 중"]
          .filter(Boolean)
          .join(" · "),
      ),
    });
  }

  const roleToolProfileLabel = readString(metadata.roleToolProfileLabel);
  const roleToolProfileTools = readStringArray(metadata.roleToolProfileTools);
  if (roleToolProfileLabel || roleToolProfileTools.length > 0) {
    commands.push({
      id: "role-tool-profile",
      label: "도구 프로필",
      tone: "info",
      value: sanitize(
        [
          roleToolProfileLabel,
          roleToolProfileTools.length > 0 ? `${roleToolProfileTools.length}개 후보` : undefined,
        ].filter(Boolean).join(" · "),
      ),
    });
  }

  if (roleToolProfileTools.length > 0) {
    commands.push({
      id: "tool-call-intent",
      label: "호출 후보",
      tone: "neutral",
      value: sanitize(roleToolProfileTools.slice(0, 3).join(", ")),
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

  const memoryTraceId = readString(metadata.memoryTraceId);
  if (memoryTraceId) {
    evidence.push({
      id: "memory-trace",
      label: "기억 추적",
      tone: "neutral",
      value: sanitize(memoryTraceId),
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

  if (steps.length === 0) {
    steps.push({
      id: "assistant-response",
      label: "응답 단계",
      tone: "info",
      value: "공개 답변 생성",
    });
  }

  if (commands.length === 0) {
    commands.push({
      id: "tool-boundary",
      label: "도구 호출",
      tone: "neutral",
      value: "필요 시 목적·입력·권한을 먼저 표시",
    });
  }

  if (evidence.length === 0) {
    evidence.push({
      id: "public-boundary",
      label: "검증 경계",
      tone: "neutral",
      value: "숨은 사고 과정 비공개 · 요약만 표시",
    });
  }

  return toTrace(
    steps,
    commands,
    evidence,
    createConversationReceipt(message, metadata) ?? createFallbackConversationReceipt(message),
  );
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

  return toTrace(steps, commands, evidence, {
    label: "토론 실행 영수증",
    status: utterance.tags.includes("risk") ? "live" : "checkpointed",
    items: [
      { label: "범위", value: sanitize(`토론/${utterance.roundId}`) },
      { label: "기준점", value: sanitize(`${utterance.agentId} · ${utterance.roundTitle}`) },
      { label: "마스킹", value: "적용됨" },
    ],
  });
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
  return toTrace(steps, commands, evidence, {
    label: "Tmux 실행 영수증",
    status: block.status === "failed" || block.status === "blocked" ? "blocked" : "checkpointed",
    items: [
      { label: "범위", value: sanitize(tmuxKindDisplayLabel(block.kind)) },
      { label: "기준점", value: sanitize(`${block.terminalSessionId} · ${block.paneId}`) },
      { label: "마스킹", value: block.redactionApplied ? "적용됨" : "확인 필요" },
    ],
  });
}

export function createPublicTraceSafetyReport(trace: PublicWorkTrace): PublicTraceSafetyReport {
  const textsToInspect: string[] = [];

  for (const group of trace.groups) {
    for (const item of group.items) {
      textsToInspect.push(item.label, item.value);
    }
  }

  if (trace.receipt) {
    textsToInspect.push(trace.receipt.label);
    for (const item of trace.receipt.items) {
      textsToInspect.push(item.label, item.value);
    }
  }

  const combinedText = textsToInspect.join(" | ");
  const patternReasons = FORBIDDEN_PUBLIC_TRACE_PATTERNS.flatMap((pattern) =>
    pattern.test(combinedText) ? [`금지 패턴 감지: ${pattern.source}`] : [],
  );
  const blockedReasons = [...patternReasons, ...inspectPublicText(combinedText).blockedReasons];
  if (trace.groups.length > 0) {
    if (!trace.receipt) {
      blockedReasons.push("마스킹 영수증 없음");
    } else {
      const hasReceiptMasking = trace.receipt.items.some(
        (item) => item.label === "마스킹" && item.value.includes("적용"),
      );
      if (!hasReceiptMasking) {
        blockedReasons.push("마스킹 미적용");
      }
    }
  }

  return {
    blockedReasons,
    isSafe: blockedReasons.length === 0,
    label: blockedReasons.length === 0 ? "마스킹 점검 통과" : "마스킹 확인 필요",
  };
}

export function createPublicWorkReceiptSummary(trace: PublicWorkTrace): PublicWorkReceiptSummary | undefined {
  if (!trace.receipt) return undefined;
  const safeItems = trace.receipt.items.map((item) => ({
    label: item.label,
    value: compactPublicText(item.value, 56),
  }));
  const scope = safeItems.find((item) => item.label === "범위")?.value;
  const checkpoint = safeItems.find((item) => item.label === "기준점")?.value;
  return {
    compactLabel: [trace.receipt.label, scope, checkpoint].filter(Boolean).join(" · "),
    detailItems: safeItems,
    statusLabel: receiptStatusLabel(trace.receipt.status),
  };
}

function toTrace(
  steps: PublicWorkTraceItem[],
  commands: PublicWorkTraceItem[],
  evidence: PublicWorkTraceItem[],
  receipt?: PublicWorkTraceReceipt,
): PublicWorkTrace {
  const groups: PublicWorkTraceGroup[] = [];
  if (steps.length > 0) groups.push({ id: "steps", items: steps, title: "작업 단계" });
  if (commands.length > 0) groups.push({ id: "commands", items: commands, title: "도구 후보" });
  if (evidence.length > 0) groups.push({ id: "evidence", items: evidence, title: "검증" });
  return { groups, receipt };
}

function createConversationReceipt(
  message: ConversationMessage,
  metadata: Record<string, unknown>,
): PublicWorkTraceReceipt | undefined {
  const hasTraceableWork =
    readBoolean(metadata.realProviderCall) !== undefined ||
    readString(metadata.route) ||
    readString(metadata.providerProfileId) ||
    readString(metadata.memoryScope) ||
    readString(metadata.recallTraceId);
  if (!hasTraceableWork) return undefined;

  const spans = [
    readBoolean(metadata.realProviderCall) !== undefined ? "generation" : undefined,
    readStringArray(metadata.runtimeConfigFileIds).length > 0 || readStringArray(metadata.roleToolProfileTools).length > 0
      ? "tool"
      : undefined,
    readDelegations(metadata).length > 0 ? "handoff" : undefined,
    readString(metadata.recallTraceId) || readString(metadata.memoryTraceId) ? "memory" : undefined,
  ].filter((value): value is string => Boolean(value));
  const checkpoint = [
    message.sessionId,
    readString(metadata.recallTraceId) ?? readString(metadata.memoryTraceId) ?? readString(metadata.providerProfileId),
  ].filter(Boolean).join(" · ");

  return {
    label: "에이전트 실행 영수증",
    status: readBoolean(metadata.realProviderCall) === false ? "fallback" : "checkpointed",
    items: [
      { label: "범위", value: sanitize(spans.length > 0 ? spans.map(spanDisplayLabel).join("/") : "메시지") },
      { label: "기준점", value: sanitize(checkpoint || message.id) },
      { label: "마스킹", value: "적용됨" },
      { label: "공개 범위", value: "요약 단계만" },
    ],
  };
}

function createFallbackConversationReceipt(message: ConversationMessage): PublicWorkTraceReceipt {
  return {
    label: "에이전트 실행 영수증",
    status: "checkpointed",
    items: [
      { label: "범위", value: "메시지" },
      { label: "기준점", value: sanitize(message.id) },
      { label: "마스킹", value: "적용됨" },
      { label: "공개 범위", value: "요약 단계만" },
    ],
  };
}

function spanDisplayLabel(span: string) {
  switch (span) {
    case "generation":
      return "생성";
    case "tool":
      return "도구";
    case "handoff":
      return "핸드오프";
    case "memory":
      return "메모리";
    default:
      return span;
  }
}

function tmuxKindDisplayLabel(kind: TerminalTimelineBlock["kind"]) {
  switch (kind) {
    case "command_intent":
      return "명령 의도";
    case "dispatch":
      return "디스패치";
    case "dry_run":
      return "드라이런";
    default:
      return kind;
  }
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

function readUsageTotalTokens(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  return readNumber(record.totalTokens) ?? readNumber(record.total_tokens);
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
  return sanitizePublicText(value);
}

function receiptStatusLabel(status: PublicWorkTraceReceipt["status"]) {
  switch (status) {
    case "checkpointed":
      return "저장됨";
    case "live":
      return "진행 중";
    case "fallback":
      return "폴백";
    case "blocked":
      return "차단";
    default:
      return status;
  }
}
