import { z } from "zod";
import type { DesignBlueprintInput, DesignTargetSurface } from "./designBlueprint.js";

/**
 * Debate → Blueprint → Mission (D6) — 캐릭터 토론이 말로 끝나지 않고 실행 가능한 Mission으로
 * 연결되게 한다. 감사(docs/85)가 짚은 갭: 토론이 CodingPacket 중간단계를 거쳐야만 미션이
 * 됐다. 여기서는 토론 결정 패킷을 DesignBlueprint 입력으로 변환해 바로 디자인 Mission으로
 * 승격한다.
 *
 * 불변식:
 *   - **토론이 실행 가능한 결정(adoptedDecisions)을 못 내면 승격 실패**(null/400) — 말잔치
 *     금지.
 *   - 단순 수정은 debate를 강제하지 않는다(shouldDebateBeforeMission이 false면 바로 Mission).
 *   - 변환은 순수 함수. 실제 토론 엔진(desktop)은 그대로 두고, 그 출력(packet)만 다리로 받는다.
 */

export const debateDecisionKindSchema = z.enum(["coding", "design", "architecture"]);
export type DebateDecisionKind = z.infer<typeof debateDecisionKindSchema>;

/** 토론이 검토한 초안에 대해 권하는 다음 행동(순수 도출 — 모델 자동 실행 아님). */
export const recommendedDebateNextActionSchema = z.enum(["promote_to_mission", "revise_blueprint", "ask_user"]);
export type RecommendedDebateNextAction = z.infer<typeof recommendedDebateNextActionSchema>;

/**
 * 토론 결과를 "원본 blueprint 초안에 대한 리뷰"로 되돌려 잇는다(point 5). 토론이 초안에서
 * 시작했을 때(blueprintContext), 무엇을 채택/반려했고 무엇이 위험이며 초안 대비 무엇이 바뀌는지
 * (blueprintDelta)를 구조화한다. 모든 값은 실제 토론 패킷에서 derive되며 모델이 생성한 것이므로
 * truthStatus는 항상 "generated"(observed 아님 — 가짜 관측 금지).
 */
export const blueprintDebateReviewSchema = z.object({
  blueprintTitle: z.string(),
  sourceSessionId: z.string().optional(),
  adopted: z.array(z.string()),
  rejected: z.array(z.string()),
  risks: z.array(z.string()),
  /** 채택된 결정 중 원본 수용 기준에 없던 것 = 초안에 대한 실제 변경 제안 */
  blueprintDelta: z.array(z.string()),
  recommendedNextAction: recommendedDebateNextActionSchema,
  truthStatus: z.literal("generated"),
});
export type BlueprintDebateReview = z.infer<typeof blueprintDebateReviewSchema>;

export const debateDecisionPacketSchema = z.object({
  id: z.string(),
  debateId: z.string(),
  kind: debateDecisionKindSchema,
  summary: z.string(),
  adoptedDecisions: z.array(z.string()).default([]),
  rejectedOptions: z.array(z.string()).default([]),
  openQuestions: z.array(z.string()).default([]),
  blueprintRef: z.string().optional(),
  missionDraftRef: z.string().optional(),
  /** 초안에서 시작한 토론이면 그 초안에 대한 리뷰(point 5). conversation-only면 없음. */
  blueprintReview: blueprintDebateReviewSchema.optional(),
});
export type DebateDecisionPacket = z.infer<typeof debateDecisionPacketSchema>;

export const missionFromDebateRequestSchema = z.object({
  packet: debateDecisionPacketSchema,
  missionId: z.string().min(1).max(128).optional(),
  createdBy: z.string().max(64).optional(),
  targetSurface: z.string().optional(),
});
export type MissionFromDebateRequest = z.infer<typeof missionFromDebateRequestSchema>;

/**
 * 토론을 강제할지 결정(순수). 큰 UX/디자인/아키텍처 변경은 토론, 단순 수정은 바로 Mission.
 */
export function shouldDebateBeforeMission(input: {
  kind?: DebateDecisionKind;
  scope?: "small" | "large";
  surfacesChanged?: number;
}): boolean {
  if (input.scope === "small") return false;
  if (input.kind === "architecture") return true;
  if (input.kind === "design" && (input.surfacesChanged ?? 1) >= 2) return true;
  if (input.scope === "large") return true;
  return false;
}

/**
 * 토론 결과 → 원본 blueprint에 대한 리뷰(순수, point 5). adopted/rejected/risks는 실제 패킷에서
 * 그대로, blueprintDelta는 원본 수용 기준에 없던 채택 결정(결정적 diff), recommendedNextAction은
 * adopted/risks로 결정적 도출. 모델 출력이므로 truthStatus="generated"(observed 아님).
 *
 * recommendedNextAction:
 *   - 채택 결정 없음 → ask_user (토론이 합의 못 함)
 *   - 미해결 질문(risks) 있음 → revise_blueprint (초안 보강 필요)
 *   - 채택 있고 미해결 없음 → promote_to_mission
 */
export function deriveBlueprintDebateReview(
  blueprint: Pick<DesignBlueprintInput, "title" | "acceptanceCriteria">,
  packet: DebateDecisionPacket,
  opts: { sourceSessionId?: string } = {},
): BlueprintDebateReview {
  const original = new Set(blueprint.acceptanceCriteria.map((criterion) => criterion.trim().toLowerCase()));
  const adopted = packet.adoptedDecisions;
  const risks = packet.openQuestions;
  const blueprintDelta = adopted.filter((decision) => !original.has(decision.trim().toLowerCase()));
  const recommendedNextAction: RecommendedDebateNextAction =
    adopted.length === 0 ? "ask_user" : risks.length > 0 ? "revise_blueprint" : "promote_to_mission";
  return {
    blueprintTitle: blueprint.title,
    ...(opts.sourceSessionId ? { sourceSessionId: opts.sourceSessionId } : {}),
    adopted,
    rejected: packet.rejectedOptions,
    risks,
    blueprintDelta,
    recommendedNextAction,
    truthStatus: "generated",
  };
}

/**
 * 토론 결정 패킷 → DesignBlueprint 입력(순수). adoptedDecisions가 없으면 null(승격 불가).
 * 토론 출력은 고수준이라 화면은 **초안 1개**로 합성된다(이후 디자인 미션에서 구체화).
 */
export function debateDecisionToBlueprintInput(
  packet: DebateDecisionPacket,
  opts: { targetSurface?: DesignTargetSurface } = {},
): DesignBlueprintInput | null {
  if (packet.adoptedDecisions.length === 0) return null;
  const primary = packet.adoptedDecisions[0]!;
  return {
    title: (packet.summary || "토론 설계안").slice(0, 200),
    userIntent: [packet.summary, ...packet.adoptedDecisions].filter(Boolean).join(" · ").slice(0, 4_000),
    targetSurface: opts.targetSurface ?? "new_app",
    screens: [
      {
        name: "주요 화면 (토론 도출 초안)",
        purpose: (packet.summary || "토론에서 합의된 주요 흐름").slice(0, 200),
        primaryAction: primary.slice(0, 200),
        secondaryActions: packet.adoptedDecisions.slice(1, 4),
        dataNeeded: [],
        emptyState: "데이터 없음 상태",
        errorState: "오류 상태",
      },
    ],
    designTokens: { density: "balanced", tone: "clean_builder", motion: "subtle" },
    acceptanceCriteria: [...packet.adoptedDecisions, ...packet.openQuestions.map((q) => `미해결: ${q}`)].slice(0, 64),
  };
}
