import { z } from "zod";
import {
  designBlueprintInputSchema,
  designTargetSurfaceSchema,
  type DesignBlueprintInput,
  type DesignTargetSurface,
} from "./designBlueprint.js";

/**
 * 대화 → App Builder 진입(3순위). 대화 텍스트를 **결정적으로** DesignBlueprintInput 초안으로
 * 바꾼다(LLM 0회). 이 결정적 stub이 토대이자 안전망 — "AI로 초안 채우기"(단발 LLM)가
 * 실패/타임아웃/빈응답이면 그대로 fallback한다.
 *
 * 순환 안전: zod와 designBlueprint(스키마/타입)만 import한다. productKernel/designMission/
 * missionBoard(레코드·미션 스키마)는 절대 import하지 않는다 — designBlueprint가 지키는
 * 규율(헤더 주석)을 그대로 따른다.
 *
 * 정직성: 이 함수는 **DesignBlueprintInput만** 만든다. DesignBlueprintInput엔 truthStatus/
 * id/createdAt가 없다 — "planned/draft" 스탬프는 하류(buildMissionCreateFromBlueprint·
 * finalizeDesignBlueprint)가 찍는다. 그래서 초안이 실수로 "observed"를 주장할 수 없다.
 */

export interface ConversationBlueprintSource {
  messages: ReadonlyArray<{ role: "user" | "assistant" | "system" | "tool"; content: string }>;
  /** 현재 컴포저 입력 — 있으면 title/primaryAction 시드로 우선 사용 */
  draft?: string;
  /** 기본 new_app */
  targetSurface?: DesignTargetSurface;
}

function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

/**
 * 대화 → DesignBlueprintInput(결정적, LLM 0회). 항상 스키마 유효한 1화면 초안을 만든다.
 * 같은 입력 → 같은 출력(결정적). 마지막에 designBlueprintInputSchema.parse로 유효성을 보증한다.
 */
export function buildBlueprintInputFromConversation(source: ConversationBlueprintSource): DesignBlueprintInput {
  const draft = source.draft?.trim() ?? "";
  const lastUser = [...source.messages].reverse().find((message) => message.role === "user")?.content?.trim() ?? "";
  const title = clip(draft || lastUser || "새 앱 초안", 200);

  // userIntent: 최근 user/assistant 발화 6개를 정직하게 결합(빈 발화 제외, 각 1000자 클립).
  const recent = source.messages
    .filter((message) => (message.role === "user" || message.role === "assistant") && message.content.trim().length > 0)
    .slice(-6);
  const joined = recent.map((message) => `${message.role}: ${clip(message.content.trim(), 1_000)}`).join("\n").trim();
  const userIntent = clip(joined || title, 4_000);

  const primaryAction = clip(draft || lastUser || "주요 작업", 200);

  const input: DesignBlueprintInput = {
    title,
    userIntent,
    targetSurface: source.targetSurface ?? "new_app",
    // 화면은 정확히 1개 — 대화에서 관측하지 않은 화면을 지어내지 않는다(정직). 사용자가 패널에서 추가.
    screens: [
      {
        name: "주요 화면 (대화 도출 초안)",
        purpose: clip(title, 200),
        primaryAction,
        secondaryActions: [],
        dataNeeded: [],
        emptyState: "표시할 데이터가 아직 없음",
        errorState: "불러오기 실패 — 다시 시도",
      },
    ],
    designTokens: { density: "balanced", tone: "clean_builder", motion: "subtle" },
    // 결정적 stub은 근거 없는 수용 기준을 주장하지 않는다 — 비워 둔다(사용자가 채움).
    acceptanceCriteria: [],
  };

  // 안전벨트: 슬라이스가 경계를 보장하지만, 명시적으로 parse해 항상 유효함을 보증한다.
  return designBlueprintInputSchema.parse(input);
}

// ── 단발 LLM "AI로 초안 채우기" 엔드포인트 계약 ─────────────────────────────────
// provider/model은 클라이언트가 지정한다(인프라 하드코딩 회피). 없으면 stub-only.

export const conversationBlueprintDraftRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system", "tool"]),
        content: z.string().max(200_000),
      }),
    )
    .min(1)
    .max(200),
  draft: z.string().max(4_000).optional(),
  targetSurface: designTargetSurfaceSchema.optional(),
  sessionId: z.string().min(1).max(128),
  /** AI 보강 opt-in. false면 결정적 stub만 반환(LLM 호출 안 함). */
  useAi: z.boolean().default(false),
  /** AI 경로에서만 사용 — 사용자가 고른 provider/model. 없으면 AI 시도 자체를 건너뛴다. */
  providerProfileId: z.string().min(1).max(128).optional(),
  modelId: z.string().min(1).max(256).optional(),
});
export type ConversationBlueprintDraftRequest = z.infer<typeof conversationBlueprintDraftRequestSchema>;

export const conversationBlueprintDraftResponseSchema = z.object({
  blueprint: designBlueprintInputSchema,
  /** 어느 경로가 이 초안을 만들었는지 — 정직성. UI가 "결정적 초안"/"AI 초안"을 구분 표기. */
  source: z.enum(["stub", "ai"]),
  /** true ⇒ AI를 시도했으나 실패/무효 → 결정적 stub으로 대체됨 */
  degraded: z.boolean().default(false),
  /** 대체 사유(한국어, 사람이 읽을 한 줄) */
  note: z.string().max(500).optional(),
});
export type ConversationBlueprintDraftResponse = z.infer<typeof conversationBlueprintDraftResponseSchema>;
