import type {
  ApprovalState,
  ExternalApprovalItem,
  ExternalChannel,
  IngressAuthorType,
  IngressConfidence,
  IngressEvent,
  IngressGuardResult,
  IngressGuardStep,
  PermissionLevel,
  SourceTrust,
} from "@ai-orchestrator/protocol";
import { redactForEventStore } from "./stage2Runtime";

export type Stage8RawIngressInput = {
  id: string;
  channel: ExternalChannel;
  authorType: IngressAuthorType;
  eventType: IngressEvent["eventType"];
  text: string;
  receivedAt: string;
  debounceWindowMs?: number;
  recentTexts?: string[];
};

export type Stage8IngressSnapshot = {
  id: string;
  channel: ExternalChannel;
  result: IngressGuardResult;
  approvals: ExternalApprovalItem[];
  checklist: string[];
  zeroTokenSafety: {
    enabled: boolean;
    cadence: string;
    lastCheck: string;
    pendingCount: number;
  };
};

export function createTelegramDemoInput(receivedAt = new Date().toISOString()): Stage8RawIngressInput {
  return {
    id: `telegram_input_${stableId(receivedAt)}`,
    channel: "legacy_telegram",
    authorType: "user",
    eventType: "message",
    text: "OpenClaw에서 이어받기: 현재 대화를 코딩 패킷으로 정리하고 터미널에서 pnpm test 실행 준비해줘. OPENAI_API_KEY=sk-stage8-demo-secret",
    receivedAt,
  };
}

export function createStage8IngressSnapshot(input = createTelegramDemoInput()): Stage8IngressSnapshot {
  const normalizedText = normalizeText([...(input.recentTexts ?? []), input.text].join(" "));
  const redactedText = redactForEventStore(normalizedText) as string;
  const requestedPermissions = detectPermissions(normalizedText);
  const confidence = classifyConfidence(normalizedText, requestedPermissions);
  const requiresApproval = requestedPermissions.length > 0 || confidence !== "high";
  const guardSteps = createGuardSteps({
    input,
    normalizedText,
    redactedText,
    requestedPermissions,
    requiresApproval,
  });
  const blocked = guardSteps.some((step) => step.status === "blocked");
  const normalizedEvent: IngressEvent | undefined = blocked
    ? undefined
    : {
        id: `ingress_event_${stableId(`${input.id}:${redactedText}`)}`,
        channel: input.channel,
        source: eventSourceForChannel(input.channel),
        sourceTrust: sourceTrustForChannel(input.channel),
        authorType: input.authorType,
        rawText: "[QUARANTINED_RAW_PAYLOAD]",
        normalizedText: redactedText,
        eventType: input.eventType,
        requestedPermissions,
        confidence,
        requiresApproval,
        redacted: redactedText !== normalizedText,
        createdAt: input.receivedAt,
      };
  const approvalState: ApprovalState = blocked ? "rejected" : requiresApproval ? "required" : "not_required";
  const result: IngressGuardResult = {
    id: `ingress_result_${stableId(`${input.id}:${approvalState}`)}`,
    inputId: input.id,
    accepted: Boolean(normalizedEvent),
    earlyReturn: blocked || input.eventType !== "message",
    confidence,
    normalizedEvent,
    guardSteps,
    approvalState,
    reason: createResultReason(blocked, requiresApproval, confidence),
    createdAt: input.receivedAt,
  };
  const approvals = normalizedEvent && requiresApproval ? [createApprovalItem(normalizedEvent, input.receivedAt)] : [];

  return {
    id: `ingress_snapshot_${stableId(`${input.id}:${input.receivedAt}`)}`,
    channel: input.channel,
    result,
    approvals,
    checklist: [
      "external source marked untrusted",
      "dangerous actions require desktop/mobile approval",
      "memory candidate stays quarantined until pinned",
      "terminal/write/secret capabilities stay denied for External Agent",
    ],
    zeroTokenSafety: {
      enabled: true,
      cadence: "3h",
      lastCheck: input.receivedAt,
      pendingCount: approvals.length,
    },
  };
}

function createGuardSteps(params: {
  input: Stage8RawIngressInput;
  normalizedText: string;
  redactedText: string;
  requestedPermissions: PermissionLevel[];
  requiresApproval: boolean;
}): IngressGuardStep[] {
  const isNoise = params.input.eventType === "system_event" || !params.normalizedText.trim();
  const isSelfResponse = params.input.authorType === "bot" || params.input.authorType === "manager";

  return [
    {
      name: "shape_unification",
      status: "passed",
      reason: `${params.input.channel} payload normalized into IngressEvent`,
    },
    {
      name: "noise_filter",
      status: isNoise ? "blocked" : "passed",
      reason: isNoise ? "system/noise event skipped before model wakeup" : "message event kept",
    },
    {
      name: "self_response_prevention",
      status: isSelfResponse ? "blocked" : "passed",
      reason: isSelfResponse ? "bot/manager author would create response loop" : "external user author accepted",
    },
    {
      name: "external_agent_isolation",
      status: (params.input.channel === "legacy_telegram" || params.input.channel === "webhook") &&
              params.requestedPermissions.some((p) => p === "secret_access" || p === "write_files" || p === "run_safe_commands")
              ? "blocked"
              : "passed",
      reason: (params.input.channel === "legacy_telegram" || params.input.channel === "webhook") &&
              params.requestedPermissions.some((p) => p === "secret_access" || p === "write_files" || p === "run_safe_commands")
        ? "external channels are restricted from write, run, or secret access capabilities"
        : "no prohibited external capability request detected",
    },
    {
      name: "debounce",
      status: "passed",
      reason: params.input.recentTexts?.length
        ? `${params.input.recentTexts.length + 1} messages merged in ${params.input.debounceWindowMs ?? 30_000}ms window`
        : "single message; merge window clear",
    },
    {
      name: "pii_secret_block",
      status: params.requestedPermissions.includes("secret_access") || params.requiresApproval ? "queued" : "passed",
      reason:
        params.redactedText !== params.normalizedText
          ? "secret-like text redacted and approval required"
          : params.requiresApproval
            ? "sensitive action waits for approval"
            : "no sensitive request detected",
    },
    {
      name: "guard_logging",
      status: "passed",
      reason: "redacted event goes to Event Store; raw payload stays out of normal log",
    },
    {
      name: "checklist_injection",
      status: "passed",
      reason: "external-agent checklist attached before session handoff",
    },
  ];
}

function createApprovalItem(event: IngressEvent, createdAt: string): ExternalApprovalItem {
  return {
    id: `external_approval_${stableId(event.id)}`,
    ingressEventId: event.id,
    channel: event.channel,
    summary: event.normalizedText.slice(0, 140),
    permissions: event.requestedPermissions,
    state: "required",
    createdAt,
  };
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function detectPermissions(value: string): PermissionLevel[] {
  const lower = value.toLowerCase();
  const permissions = new Set<PermissionLevel>();

  if (/(terminal|터미널|pnpm|npm|python|bash|실행|run)/i.test(value)) {
    permissions.add("run_safe_commands");
  }

  if (/(delete|삭제|rm |move|write|파일 수정|수정|저장|patch|merge|push)/i.test(value)) {
    permissions.add("write_files");
  }

  if (/(api[_ -]?key|token|secret|bearer|sk-)/i.test(lower)) {
    permissions.add("secret_access");
  }

  return Array.from(permissions);
}

function classifyConfidence(value: string, permissions: PermissionLevel[]): IngressConfidence {
  if (permissions.length > 0 || /(환불|결제|개인정보|삭제|merge|push|secret|token|api key)/i.test(value)) {
    return "low";
  }

  if (/(코딩|패킷|토론|검토|요약)/i.test(value)) {
    return "medium";
  }

  return "high";
}

function sourceTrustForChannel(channel: ExternalChannel): SourceTrust {
  return channel === "legacy_telegram" || channel === "webhook" ? "untrusted" : "limited";
}

function eventSourceForChannel(channel: ExternalChannel) {
  if (channel === "legacy_telegram") {
    return "legacy_telegram";
  }

  if (channel === "mobile") {
    return "mobile";
  }

  return "api";
}

function createResultReason(blocked: boolean, requiresApproval: boolean, confidence: IngressConfidence) {
  if (blocked) {
    return "blocked before session handoff";
  }

  if (requiresApproval) {
    return `${confidence} confidence external input queued for approval`;
  }

  return "high confidence external input accepted";
}

function stableId(value: string) {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(16);
}
