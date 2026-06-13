import type { AgentActivityStatus } from "../types";

/**
 * 토큰/비용 HUD 표시 조건(제안4) — 평상시 시각 노이즈를 줄인다. 아래일 때만 표시:
 *   1. 턴 진행 중(preparing/tooling/responding/dispatching/testing/capturing)
 *   2. 컨텍스트 80% 이상(경고)
 *   3. (옵션) 마지막 턴 완료 후 5초 이내 — `lastTurnCompletedAt`이 주어질 때만.
 *
 * 주의: 현재 ConversationUsageSummary엔 lastTurnCompletedAt 필드가 없어 통합에선 이 값을 넘기지
 * 않는다(=페이드아웃 미적용). 나중에 턴 완료 시각을 배선하면 5초 잔상도 동작한다. 순수 함수라
 * "지금 시간(now)"을 주입받는다(렌더에서 Date.now()).
 */
export function shouldShowUsageHud({
  activity,
  contextPercent,
  lastTurnCompletedAt,
  now,
  turns,
}: {
  activity: AgentActivityStatus;
  contextPercent: number;
  lastTurnCompletedAt?: number;
  now: number;
  turns: number;
}): boolean {
  if (turns === 0) return false; // 보여줄 게 없다
  if (isActiveActivity(activity)) return true; // 턴 진행 중
  if (contextPercent >= 80) return true; // 컨텍스트 경고
  if (lastTurnCompletedAt !== undefined && now - lastTurnCompletedAt < 5_000) return true; // 잔상(옵션)
  return false;
}

function isActiveActivity(activity: AgentActivityStatus): boolean {
  return (
    activity === "preparing" ||
    activity === "responding" ||
    activity === "tooling" ||
    activity === "dispatching" ||
    activity === "testing" ||
    activity === "capturing"
  );
}
