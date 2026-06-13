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
