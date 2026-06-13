import { z } from "zod";
import { truthStatusSchema } from "./truthStatus.js";

/**
 * DesignBlueprint — "예쁘게 해줘"를 구조화된 Mission 입력으로 바꾼다. 디자인을 제대로
 * 시키려면 화면/주요액션/빈화면/오류상태/접근성 기준을 먼저 구조화해야 한다.
 *
 * 이 모듈은 **스키마 + 순수 변환만** 담는다(zod/truthStatus만 import) — productKernel이
 * 이걸 record 필드로 import해도 순환이 안 생기게. 미션 생성 빌더(역할 배정)는
 * designMission.ts에 따로 둔다.
 */

export const designTargetSurfaceSchema = z.enum([
  "conversation",
  "dashboard",
  "mission_board",
  "cockpit",
  "theater",
  "settings",
  "new_app",
]);
export type DesignTargetSurface = z.infer<typeof designTargetSurfaceSchema>;

export const designScreenSchema = z.object({
  id: z.string(),
  name: z.string(),
  purpose: z.string(),
  primaryAction: z.string(),
  secondaryActions: z.array(z.string()).default([]),
  dataNeeded: z.array(z.string()).default([]),
  emptyState: z.string(),
  errorState: z.string(),
});
export type DesignScreen = z.infer<typeof designScreenSchema>;

/** 입력 화면 — id는 서버가 부여한다(클라이언트가 정하지 않음). */
export const designScreenInputSchema = designScreenSchema.omit({ id: true });
export type DesignScreenInput = z.infer<typeof designScreenInputSchema>;

export const designTokensSchema = z.object({
  density: z.enum(["compact", "balanced", "spacious"]),
  tone: z.enum(["cyber_glass", "clean_builder", "anime_os", "minimal"]),
  motion: z.enum(["none", "subtle", "expressive"]),
});
export type DesignTokens = z.infer<typeof designTokensSchema>;

export const designBlueprintSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  title: z.string(),
  userIntent: z.string(),
  targetSurface: designTargetSurfaceSchema,
  screens: z.array(designScreenSchema),
  designTokens: designTokensSchema,
  acceptanceCriteria: z.array(z.string()),
  createdAt: z.string(),
});
export type DesignBlueprint = z.infer<typeof designBlueprintSchema>;

/** 블루프린트 입력 — id/missionId/createdAt/screen.id는 서버가 부여한다. */
export const designBlueprintInputSchema = z.object({
  title: z.string().min(1).max(300),
  userIntent: z.string().min(1).max(4_000),
  targetSurface: designTargetSurfaceSchema,
  screens: z.array(designScreenInputSchema).min(1).max(32),
  designTokens: designTokensSchema,
  acceptanceCriteria: z.array(z.string().max(500)).max(64).default([]),
});
export type DesignBlueprintInput = z.infer<typeof designBlueprintInputSchema>;

export const missionFromBlueprintRequestSchema = z.object({
  blueprint: designBlueprintInputSchema,
  missionId: z.string().min(1).max(128).optional(),
  createdBy: z.string().max(64).optional(),
  /** 대화→앱빌더 출처 세션 (provenance) — 미션·trace에 실린다 */
  sourceSessionId: z.string().min(1).max(128).optional(),
});
export type MissionFromBlueprintRequest = z.infer<typeof missionFromBlueprintRequestSchema>;

export const missionDesignBlueprintRecordedPayloadSchema = z.object({
  missionId: z.string(),
  blueprint: designBlueprintSchema,
});
export type MissionDesignBlueprintRecordedPayload = z.infer<typeof missionDesignBlueprintRecordedPayloadSchema>;

/** 입력 → 완성된 블루프린트(순수). 화면마다 결정적 id를 부여한다. */
export function finalizeDesignBlueprint(
  input: DesignBlueprintInput,
  opts: { id: string; missionId: string; now: () => string },
): DesignBlueprint {
  return {
    id: opts.id,
    missionId: opts.missionId,
    title: input.title,
    userIntent: input.userIntent,
    targetSurface: input.targetSurface,
    screens: input.screens.map((screen, index) => ({ ...screen, id: `${opts.id}_screen_${index + 1}` })),
    designTokens: input.designTokens,
    acceptanceCriteria: input.acceptanceCriteria,
    createdAt: opts.now(),
  };
}

/**
 * 블루프린트의 화면/수용기준을 planned 아티팩트(초안 예정)로 만든다 — 전부 truthStatus
 * planned(실제 구현물 아님). 화면당 1개 + 수용기준 1개.
 */
export function plannedArtifactsFromBlueprint(
  blueprint: DesignBlueprint,
  missionId: string,
  now: () => string,
): Array<{ id: string; missionId: string; kind: "markdown_report"; summary: string; truthStatus: "planned"; createdAt: string }> {
  const screens = blueprint.screens.map((screen, index) => ({
    id: `artifact_${missionId}_screen_${index + 1}`,
    missionId,
    kind: "markdown_report" as const,
    summary: `화면 시안(예정): ${screen.name} — 주요액션 ${screen.primaryAction}`,
    truthStatus: "planned" as const,
    createdAt: now(),
  }));
  if (blueprint.acceptanceCriteria.length > 0) {
    screens.push({
      id: `artifact_${missionId}_acceptance`,
      missionId,
      kind: "markdown_report" as const,
      summary: `수용 기준(${blueprint.acceptanceCriteria.length}개)`,
      truthStatus: "planned" as const,
      createdAt: now(),
    });
  }
  return screens;
}
