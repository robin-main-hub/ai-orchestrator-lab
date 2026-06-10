import type { ConversationAttachment, ConversationMessage, ModelDescriptor, SecretRef } from "@ai-orchestrator/protocol";
import type {
  AgentConfigTab,
  AgentCreativityLevel,
  AgentPersonaSettings,
  AgentVisualSettings,
  AgentVoicePreset,
  DraftAttachment,
  WorkbenchAgent,
} from "../types";
import { agentVisualStorageKey, maxDraftAttachments, now } from "./appConstants";
import { getBundledAgentPersonaContent } from "./agentPersonaContent";
import { getPersonaAvatarUrl } from "./personaAvatars";
export function slugifyProviderName(value: string, fallback: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

export function providerDisplayLabel(name: string): string {
  const normalized = name.trim().toLowerCase();
  const dgxMatch = name.match(/\bDGX-(0?1|0?2)\b/i);
  const grokSessionMatch = name.match(/grok.*#\s*(\d+)/i);
  const dgxNumber = dgxMatch?.[1];
  const grokSessionNumber = grokSessionMatch?.[1];

  if (normalized.includes("mimo")) return "MiMo";
  if (normalized.includes("apikey.fun") || normalized.includes("apifun")) {
    if (normalized.includes("claude a")) return "Claude A (APIFun)";
    if (normalized.includes("claude b")) return "Claude B (APIFun)";
    return "Claude (3rd)";
  }
  if (normalized.includes("\uB9AC\uC140\uB7EC") || normalized.includes("reseller")) {
    if (normalized.includes("\uD638\uD658")) return "\uB9AC\uC140\uB7EC \uD638\uD658";
    return "\uB9AC\uC140\uB7EC";
  }
  if (
    normalized.includes("openai") &&
    (normalized.includes("\uD638\uD658") || normalized.includes("compatible") || normalized.includes("compat"))
  ) {
    return "OpenAI \uD638\uD658";
  }
  if (normalized.includes("deepseek")) {
    if (normalized.includes("dgx")) return "DeepSeek (DGX)";
    return "DeepSeek";
  }
  if (normalized.includes("openrouter")) {
    if (normalized.includes("dgx")) return "OpenRouter (DGX)";
    return "OpenRouter";
  }
  if (normalized.includes("codex")) return "Codex";
  if (grokSessionNumber) return `Grok #${grokSessionNumber}`;
  if (normalized.includes("grok")) return "Grok";
  if (normalized.includes("gemini")) return "Gemini";
  if (normalized.includes("anthropic") || normalized.includes("claude")) return "Claude";
  if (normalized.includes("openclaw")) {
    if (dgxNumber) return `DGX-${dgxNumber.padStart(2, "0")} OpenClaw`;
    return "OpenClaw";
  }
  if (dgxNumber) return `DGX-${dgxNumber.padStart(2, "0")}`;
  if (normalized.includes("dgx")) return "DGX";
  if (normalized.includes("openai")) return "OpenAI";

  return name;
}

export function createAgentModelRouteLabel({
  modelId,
  modelName,
  providerName,
  source,
}: {
  modelId?: string;
  modelName?: string;
  providerName?: string;
  source?: "agent" | "provider_default" | "catalog";
}) {
  const providerLabel = providerName ? providerDisplayLabel(providerName) : "공급자 대기";
  const trimmedModelId = modelId?.trim();
  const trimmedModelName = modelName?.trim();
  const modelLabel = formatModelDisplayName(trimmedModelName || trimmedModelId);
  const sourceLabel =
    source === "agent"
      ? "현재 에이전트 고정"
      : source === "provider_default"
        ? "공급자 기본"
        : source === "catalog"
          ? "카탈로그 후보"
          : undefined;

  return `${sourceLabel ? `${sourceLabel} · ` : ""}${providerLabel} / ${modelLabel}`;
}

export function formatModelDisplayName(value?: string) {
  const model = value?.trim();
  if (!model) return "모델 연결 대기";
  const known: Record<string, string> = {
    "claude-opus-4-6": "Claude Opus 4.6",
    "claude-opus-4-7": "Claude Opus 4.7",
    "claude-opus-4-8": "Claude Opus 4.8",
    "mimo-v2.5": "MiMo V2.5",
    "mimo-v2.5-asr": "MiMo V2.5 ASR",
    "mimo-v2.5-pro": "MiMo V2.5 Pro",
  };
  if (known[model]) return known[model];
  if (/^gpt-\d/.test(model)) return model.toUpperCase();
  return model
    .replace(/^claude-/i, "Claude ")
    .replace(/^mimo-/i, "MiMo ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function classifyDraftAttachment(file: File): ConversationAttachment["kind"] {
  return file.type.startsWith("image/") ? "image" : "document";
}

export function createDraftAttachment(file: File): DraftAttachment {
  return {
    id: `attachment_${crypto.randomUUID()}`,
    name: file.name,
    kind: classifyDraftAttachment(file),
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    storage: "metadata_only",
  };
}

export function formatAttachmentSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function getMessageAttachments(message: ConversationMessage): ConversationAttachment[] {
  const attachments = message.metadata?.attachments;
  if (!Array.isArray(attachments)) {
    return [];
  }

  return attachments
    .filter((attachment): attachment is ConversationAttachment => {
      if (!attachment || typeof attachment !== "object") {
        return false;
      }
      const candidate = attachment as ConversationAttachment;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.name === "string" &&
        (candidate.kind === "image" || candidate.kind === "document") &&
        typeof candidate.mimeType === "string" &&
        typeof candidate.size === "number" &&
        typeof candidate.storage === "string"
      );
    })
    .slice(0, maxDraftAttachments);
}

export function getModelInputModalities(model?: ModelDescriptor): NonNullable<ModelDescriptor["inputModalities"]> {
  return model?.inputModalities?.length ? model.inputModalities : ["text"];
}

export function modelSupportsAttachmentKind(model: ModelDescriptor | undefined, kind: ConversationAttachment["kind"]) {
  if (!model) {
    return false;
  }
  const modalities = getModelInputModalities(model);
  if (kind === "document") {
    return modalities.includes("document") || modalities.includes("text");
  }
  return modalities.includes(kind);
}

export function modelSupportsAnyAttachment(model?: ModelDescriptor) {
  if (!model) {
    return false;
  }
  const modalities = getModelInputModalities(model);
  return modalities.includes("image") || modalities.includes("document") || modalities.includes("text");
}

export function attachmentAcceptForModel(model?: ModelDescriptor) {
  const accept: string[] = [];
  if (modelSupportsAttachmentKind(model, "image")) {
    accept.push("image/*");
  }
  if (modelSupportsAttachmentKind(model, "document")) {
    accept.push(".pdf", ".doc", ".docx", ".txt", ".md", ".csv", ".json");
  }

  return accept.join(",");
}

export function attachmentCapabilityLabel(model?: ModelDescriptor) {
  if (!model) {
    return "모델 메타데이터 없음";
  }

  const modalities = getModelInputModalities(model);
  const labels = [
    modalities.includes("image") ? "이미지" : undefined,
    modalities.includes("document") || modalities.includes("text") ? "문서" : undefined,
  ].filter(Boolean);

  return labels.length > 0 ? `${labels.join(" / ")} 입력 가능` : "텍스트 전용";
}

export function agentProfileSlug(agent: WorkbenchAgent) {
  return sanitizeAgentPersonaDirectory(agent.personaName ?? agent.role) || slugifyProviderName(agent.name, agent.id);
}

function sanitizeAgentPersonaDirectory(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function defaultVoicePresetForRole(role: WorkbenchAgent["role"]): AgentVoicePreset {
  if (role === "architect") {
    return "architect";
  }
  if (role === "reviewer" || role === "verifier" || role === "skeptic") {
    return "reviewer";
  }
  if (role === "executor" || role === "builder") {
    return "executor";
  }
  if (role === "memory_curator" || role === "auditor") {
    return "calm";
  }

  return "direct";
}

export function defaultCreativityForRole(role: WorkbenchAgent["role"]): AgentCreativityLevel {
  if (role === "architect" || role === "skeptic") {
    return "creative";
  }
  if (role === "reviewer" || role === "verifier" || role === "auditor") {
    return "focused";
  }
  if (role === "executor" || role === "external") {
    return "strict";
  }

  return "balanced";
}

export function defaultSoulSummaryForAgent(agent: WorkbenchAgent) {
  if (agent.role === "orchestrator") {
    return `# Orchestrator Soul

## 정체성
나는 AI Orchestrator Lab의 지휘자다. 사용자의 대화가 토론, 결정, 코딩 패킷, 실행 기록, 기억, 백업으로 이어지게 만든다.

## 판단 기준
- Conversation Workbench를 기본 작업 방식으로 유지한다.
- 토론은 말싸움이 아니라 결정과 코딩 전달을 위한 도구로 쓴다.
- 작게 축소하지 말고 전체 제품 목표를 보존하되, 의존성이 낮은 순서로 연결한다.
- DGX-02, 로컬 모델, provider, tmux 실행, 백업, 권한 상태를 항상 구분한다.
- API key, bearer token, OAuth token, .env 값은 절대 본문이나 로그에 남기지 않는다.

## 말투
한국어로 짧고 분명하게 말한다. 사용자가 결정해야 하는 부분은 공란으로 남기고, 나머지는 먼저 진행한다.`;
  }

  if (agent.role === "architect") {
    return `# Architect Soul

## 정체성
나는 시스템 경계와 장기 유지보수성을 지키는 설계자다.

## 판단 기준
- protocol, event storage, permission, redaction 경계를 먼저 본다.
- UI나 런타임이 타입 경계를 우회하지 못하게 한다.
- 단기 편의보다 이후 DGX, 로컬 폴백, tmux, 백업 확장을 고려한다.

## 말투
대안과 트레이드오프를 분명히 말하되, 결론을 미루지 않는다.`;
  }

  if (agent.role === "reviewer" || agent.role === "verifier") {
    return `# Reviewer Soul

## 정체성
나는 회귀, 보안 누수, 빠진 검증을 먼저 보는 검토자다.

## 판단 기준
- 버그 가능성, 권한 우회, redaction 누락, provider 신뢰도 문제를 우선 확인한다.
- 테스트 가능성과 사용자 화면에서의 혼란을 같이 본다.
- 문제를 찾으면 파일과 행동 단위로 고칠 수 있게 말한다.

## 말투
칭찬보다 위험과 다음 조치를 먼저 말한다.`;
  }

  if (agent.role === "executor" || agent.role === "builder") {
    return `# Executor Soul

## 정체성
나는 승인된 작업을 짧고 확실하게 실행하는 실무자다.

## 판단 기준
- 실행 전 permission state를 확인한다.
- 위험 명령, 파일 삭제, 원격 실행, secret 접근은 승인 없이 하지 않는다.
- 결과는 Event Storage에 남길 수 있는 형태로 정리한다.

## 말투
실행한 것, 막힌 것, 검증한 것을 간단히 보고한다.`;
  }

  return `# ${agent.name} Soul

## 정체성
나는 ${agentRoleLabel(agent.role)} 역할로 현재 세션의 목표를 작업 결과까지 연결한다.

## 판단 기준
- 현재 세션의 목표, 권한 경계, provider 신뢰도, 검증 계획을 먼저 확인한다.
- 기억과 soul을 구분하고, 필요한 정보만 주입한다.
- 사용자의 큰 방향을 임의로 줄이지 않는다.

## 말투
한국어로 간결하게 말하고, 불확실한 부분은 불확실하다고 밝힌다.`;
}

export function defaultSoulExampleDialogueForAgent(agent: WorkbenchAgent) {
  if (agent.role === "orchestrator") {
    return `사용자: 이걸 바로 만들어도 돼?
Orchestrator: 바로 만들 수 있는 부분은 진행하고, API 키나 원격 실행처럼 결정이 필요한 부분만 멈춰서 확인하겠습니다.

사용자: 토론으로 돌려봐.
Orchestrator: 현재 대화의 목표, 제약, 미결 쟁점, 관련 기억을 Debate Context로 승격하고 최종 결과는 Coding Packet으로 묶겠습니다.`;
  }

  if (agent.role === "reviewer" || agent.role === "verifier") {
    return `사용자: 이 구조 괜찮아?
${agent.name}: 먼저 깨질 가능성이 큰 경계부터 보겠습니다. Event Storage, permission, redaction, provider trust 순서로 점검하겠습니다.`;
  }

  return `사용자: 이 방향 괜찮아?
${agent.name}: 먼저 결정 기준을 짚고, 위험한 가정은 분리해서 말하겠습니다.`;
}

export function defaultAgentsInstructionForAgent(agent: WorkbenchAgent) {
  if (agent.role === "orchestrator") {
    return `# Orchestrator AGENTS.md

## 운영 원칙
- 사용자와의 대화를 기본 진입점으로 삼는다.
- 필요한 경우 Debate Context로 승격하고, 결과는 Coding Packet으로 구조화한다.
- 실제 실행은 permission, redaction, event 기록 가능 여부를 확인한 뒤 진행한다.
- DGX-01은 잠금 대상으로 취급하고 건드리지 않는다.
- Gemini CLI는 별도 설정 전까지 연결하지 않는다.
- provider가 untrusted이면 자동 메모리 주입과 secret 접근을 제한한다.

## 산출물
- 결정 사항
- 보류한 질문
- Coding Packet 후보
- 실행/검증 계획
- Event Storage에 남길 기록`;
  }

  if (agent.role === "architect") {
    return `# Architect AGENTS.md

## 운영 원칙
- 먼저 protocol 타입과 event boundary를 확인한다.
- 앱, 서버, provider, agent runtime이 서로 다른 구조를 갖지 않도록 맞춘다.
- 새로운 기능은 Event Storage, Permission Matrix, Redaction Layer에 연결될 수 있어야 한다.

## 산출물
- 타입 변경안
- 경계 결정
- 대체안과 선택 이유
- 이후 확장 포인트`;
  }

  if (agent.role === "reviewer" || agent.role === "verifier") {
    return `# Reviewer AGENTS.md

## 운영 원칙
- 보안, 권한, redaction, fallback, UI 오해 가능성을 먼저 본다.
- 테스트 누락과 실제 사용자 흐름의 끊김을 같이 확인한다.
- 발견한 문제는 재현 조건과 수정 방향을 함께 기록한다.

## 산출물
- 위험 목록
- 필요한 테스트
- 막아야 할 동작
- 승인 전 체크리스트`;
  }

  return `# ${agent.name} AGENTS.md

## 운영 원칙
- 역할: ${agentRoleLabel(agent.role)}
- provider와 model 선택 상태를 확인한다.
- 권한이 필요한 작업은 승인 없이 실행하지 않는다.
- 결과는 Event Storage에 기록 가능한 단위로 정리한다.

## 산출물
- 작업 결과
- 검증 결과
- 남은 위험`;
}

export function defaultForbiddenStyleForAgent(agent: WorkbenchAgent) {
  if (agent.role === "orchestrator") {
    return "근거 없는 확신, 장황한 설교, 사용자의 큰 목표를 임의로 축소하는 말, 승인 없는 실행, secret 원문 요청";
  }

  if (agent.role === "reviewer" || agent.role === "verifier") {
    return "막연한 칭찬, 파일/라인 없는 지적, 재현 불가능한 위험 주장, 검증 생략";
  }

  return "근거 없는 확신, 장황한 말투, 승인 없는 실행, secret 원문 노출";
}

export function createDefaultPersonaSettings(agent: WorkbenchAgent): AgentPersonaSettings {
  const slug = agentProfileSlug(agent);
  const bundledPersona = getBundledAgentPersonaContent(slug);
  return {
    voicePreset: defaultVoicePresetForRole(agent.role),
    creativityLevel: defaultCreativityForRole(agent.role),
    agentsMdPath: `agents/${slug}/AGENTS.md`,
    soulMdPath: `agents/${slug}/SOUL.md`,
    soulSummary: bundledPersona?.soulMd ?? defaultSoulSummaryForAgent(agent),
    soulExampleDialogue: defaultSoulExampleDialogueForAgent(agent),
    agentsInstruction: bundledPersona?.agentsMd ?? defaultAgentsInstructionForAgent(agent),
    forbiddenStyle: defaultForbiddenStyleForAgent(agent),
  };
}

export function getAgentInitials(name: string) {
  const normalized = name.trim();
  if (!normalized) {
    return "AI";
  }

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length === 1) {
    return (tokens[0] ?? "AI").slice(0, 2).toUpperCase();
  }

  return `${tokens[0]?.[0] ?? ""}${tokens[1]?.[0] ?? ""}`.toUpperCase();
}

export function createInitialAgentVisualSettings(agents: WorkbenchAgent[]): Record<string, AgentVisualSettings> {
  // Layer 1 (lowest precedence): bundled persona avatar from
  // agents/<personaName | role>/avatar.{svg,png,jpg,jpeg,webp}, if any.
  // Layer 2: localStorage-stored visuals (user-uploaded overrides).
  // Stored values fully replace the bundled fallback so explicit user
  // uploads always win, and `clear avatar` truly clears.
  const defaults = Object.fromEntries(
    agents.map((agent) => {
      const bundledUrl = getPersonaAvatarUrl(agent.personaName ?? agent.role);
      const visual: AgentVisualSettings = bundledUrl ? { avatarDataUrl: bundledUrl } : {};
      return [agent.id, visual];
    }),
  );
  try {
    if (typeof window === "undefined") {
      return defaults;
    }

    const stored = window.localStorage.getItem(agentVisualStorageKey);
    if (!stored) {
      return defaults;
    }

    const parsed = JSON.parse(stored) as Record<string, AgentVisualSettings>;
    // Per-key deep merge so a stored EMPTY entry ({}) — written by add-agent,
    // clear-avatar, or any run that predated the bundled avatar.* files — does
    // not shadow the bundled fallback. A stored avatarDataUrl still wins.
    const merged: Record<string, AgentVisualSettings> = { ...defaults };
    for (const [id, value] of Object.entries(parsed)) {
      merged[id] = { ...(defaults[id] ?? {}), ...value };
    }
    return merged;
  } catch {
    return defaults;
  }
}

export function createDgxVaultSecretRef(id: string, label: string, redactedPreview: string): SecretRef {
  return {
    id,
    label,
    scope: "workspace",
    redactedPreview,
    transient: false,
    createdAt: now,
  };
}


export function agentRoleLabel(role: WorkbenchAgent["role"]) {
  const labels: Record<WorkbenchAgent["role"], string> = {
    architect: "설계자",
    auditor: "감사자",
    builder: "구현자",
    executor: "실행자",
    external: "외부 응대자",
    memory_curator: "기억 관리자",
    orchestrator: "지휘자",
    reviewer: "검토자",
    skeptic: "비판자",
    verifier: "검증자",
    // R3.2 expansion
    researcher: "정보 수집가",
    negotiator: "협상 자문",
    risk_officer: "위험 분석가",
    mediator: "의견 조율자",
    watchdog: "장기 모니터",
    domain_expert: "도메인 전문가",
    // R3.3 companion (만능 캐릭터 / 전속 비서)
    companion: "전속 비서",
  };

  return labels[role];
}
