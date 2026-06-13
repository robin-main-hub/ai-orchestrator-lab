import {
  shouldDebateBeforeMission,
  type ConversationBlueprintDraftRequest,
  type DesignBlueprintInput,
  type DesignTargetSurface,
  type MissionFromBlueprintRequest,
} from "@ai-orchestrator/protocol";

/**
 * App Builder 진입(3순위) 순수 모델 — 대화 → 검토 패널 → 미션의 결정 로직만. 컴포넌트는
 * 이 함수들을 호출하는 얇은 껍데기. 정직성 규칙(초안은 planned, AI 위장 금지)을 여기서 못박는다.
 */

export type AppBuildMode = "simple" | "debate";

export type AppBuildConversationMessage = { role: "user" | "assistant" | "system" | "tool"; content: string };

export type AppBuildSeed = {
  /** 결정적 stub으로 채운 초기 청사진(컴포저 진입 시) */
  blueprint: DesignBlueprintInput;
  /** provenance — 어느 대화 세션에서 왔는지 */
  sourceSessionId: string;
  /** AI 보강용 대화 맥락 */
  messages: AppBuildConversationMessage[];
  /** 진입 시점의 컴포저 입력 */
  draft?: string;
};

/** 화면 수로 단순↔토론 기본값을 정한다(사용자가 패널에서 오버라이드 가능). */
export function initialAppBuildMode(blueprint: DesignBlueprintInput): AppBuildMode {
  return shouldDebateBeforeMission({ kind: "design", surfacesChanged: blueprint.screens.length }) ? "debate" : "simple";
}

/** 토글 캡션 — 왜 이 기본값인지 정직하게. */
export function appBuildModeCaption(blueprint: DesignBlueprintInput): string {
  const n = blueprint.screens.length;
  return n >= 2 ? `화면 ${n}개 — 큰 변경이라 토론 권장` : "화면 1개 — 단순 변경, 바로 미션";
}

/**
 * 검토 패널 → /missions/blueprint-draft 요청. model이 있으면 AI 보강 opt-in, 없으면 stub-only.
 * provider/model은 사용자가 고른 것(인프라 하드코딩 안 함).
 */
export function buildBlueprintDraftRequest(input: {
  messages: AppBuildConversationMessage[];
  draft?: string;
  sessionId: string;
  targetSurface?: DesignTargetSurface;
  model?: { id: string; providerProfileId: string };
}): ConversationBlueprintDraftRequest {
  return {
    messages: input.messages
      .filter((message) => message.content.trim().length > 0)
      .map((message) => ({ role: message.role, content: message.content })),
    draft: input.draft,
    targetSurface: input.targetSurface,
    sessionId: input.sessionId,
    useAi: Boolean(input.model),
    providerProfileId: input.model?.providerProfileId,
    modelId: input.model?.id,
  };
}

/** 검토 패널 편집본 → /missions/from-blueprint 요청(sourceSessionId provenance 포함). */
export function buildFromBlueprintRequest(input: {
  blueprint: DesignBlueprintInput;
  sourceSessionId: string;
  createdBy?: string;
}): MissionFromBlueprintRequest {
  return { blueprint: input.blueprint, createdBy: input.createdBy ?? "appbuild", sourceSessionId: input.sourceSessionId };
}

/**
 * "미션 만들기" 분기 결정(순수). 단순 → from-blueprint 요청(provenance 포함), 큰 변경 → 토론
 * 핸드오프에 **편집한 blueprint를 실어** 보낸다(토론 런타임이 blueprintContext로 실제 검토·반박·
 * 개선한다 — 척이 아니라 진짜 전달). sourceSessionId도 함께 넘겨 debate record/trace에 남긴다.
 */
export type AppBuildSubmitPlan =
  | { kind: "mission"; request: MissionFromBlueprintRequest }
  | { kind: "debate"; blueprint: DesignBlueprintInput; sourceSessionId: string };

export function appBuildSubmitPlan(input: {
  mode: AppBuildMode;
  blueprint: DesignBlueprintInput;
  sourceSessionId: string;
}): AppBuildSubmitPlan {
  if (input.mode === "debate") return { kind: "debate", blueprint: input.blueprint, sourceSessionId: input.sourceSessionId };
  return { kind: "mission", request: buildFromBlueprintRequest({ blueprint: input.blueprint, sourceSessionId: input.sourceSessionId }) };
}

export type DraftBadge = { label: string; tone: "muted" | "primary" | "warning"; detail?: string };

/**
 * 초안 출처 → 정직성 배지. AI가 만든 초안도 "planned/draft"일 뿐 절대 observed가 아니다.
 * degraded(=AI 시도 실패)는 결정적 stub으로 대체됐음을 명시한다.
 */
export function draftSourceBadge(state: { source: "stub" | "ai"; degraded: boolean; note?: string }): DraftBadge {
  if (state.degraded) return { label: "AI 실패 — 결정적 초안으로 대체", tone: "warning", detail: state.note };
  if (state.source === "ai") return { label: "AI 초안 · draft(planned)", tone: "primary" };
  return { label: "결정적 초안 · LLM 미사용", tone: "muted" };
}
