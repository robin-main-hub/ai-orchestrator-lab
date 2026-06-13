import type { CockpitNextActionItem } from "./cockpitNextActions";

/**
 * 콕핏 L1(첫 눈) 건강 롤업 — 운영자가 3초 안에 "지금 괜찮은가 / 뭘 해야 하나"를
 * 읽게 한다. 정보 나열 대신 한 줄 신호(red/yellow/green) + 가장 긴급한 액션 하나.
 *
 * 우선순위:
 *   red    — 차단된 워커, high 우선순위 액션, 고위험 승인, DGX 미러 오프라인
 *   yellow — 대기 중 승인, 폴백 활성, warning 액션 등 처리하면 좋은 신호
 *   green  — 처리할 게 없음
 *
 * 순수 함수 — 입력 신호만으로 도출되어 단위 테스트된다.
 */
export type CockpitHealthLevel = "red" | "yellow" | "green";

export type CockpitHealthRollup = {
  level: CockpitHealthLevel;
  headline: string;
  /** 가장 먼저 처리할 액션 (없으면 undefined) */
  topAction?: CockpitNextActionItem;
  /** 펼치지 않고도 보이는 신호 요약 (예: "차단 1 · 승인 2") */
  signalSummary: string;
  /** 펼쳤을 때 더 볼 게 있는 신호 개수 */
  pendingCount: number;
};

export function deriveCockpitHealthRollup(input: {
  blockedCount: number;
  approvalCount: number;
  criticalApprovalCount: number;
  fallbackActive: boolean;
  dgxMirrorOffline: boolean;
  nextActions: ReadonlyArray<CockpitNextActionItem>;
}): CockpitHealthRollup {
  const { blockedCount, approvalCount, criticalApprovalCount, fallbackActive, dgxMirrorOffline, nextActions } = input;
  const topAction = pickTopAction(nextActions);
  const pendingCount = blockedCount + approvalCount + (fallbackActive ? 1 : 0) + (dgxMirrorOffline ? 1 : 0);

  const summaryParts: string[] = [];
  if (blockedCount > 0) summaryParts.push(`차단 ${blockedCount}`);
  if (approvalCount > 0) summaryParts.push(`승인 ${approvalCount}`);
  if (fallbackActive) summaryParts.push("폴백 활성");
  if (dgxMirrorOffline) summaryParts.push("DGX 미러 오프라인");
  const signalSummary = summaryParts.join(" · ") || "신호 없음";

  // red: 즉시 손이 가야 하는 상태
  if (blockedCount > 0 || criticalApprovalCount > 0 || dgxMirrorOffline || hasPriority(nextActions, "high")) {
    return {
      level: "red",
      headline: blockedCount > 0 ? `워커 ${blockedCount}건 차단 — 즉시 확인` : topAction?.label ?? "긴급 처리 필요",
      topAction,
      signalSummary,
      pendingCount,
    };
  }

  // yellow: 처리하면 좋은 상태
  if (approvalCount > 0 || fallbackActive || hasPriority(nextActions, "warning")) {
    return {
      level: "yellow",
      headline: topAction?.label ?? (approvalCount > 0 ? `승인 ${approvalCount}건 대기` : "확인 권장"),
      topAction,
      signalSummary,
      pendingCount,
    };
  }

  return {
    level: "green",
    headline: "모든 신호 정상 — 처리할 항목 없음",
    topAction,
    signalSummary,
    pendingCount,
  };
}

function hasPriority(actions: ReadonlyArray<CockpitNextActionItem>, priority: CockpitNextActionItem["priority"]): boolean {
  return actions.some((action) => action.priority === priority);
}

/** high → warning → normal 순으로 가장 긴급한 액션 하나 */
function pickTopAction(actions: ReadonlyArray<CockpitNextActionItem>): CockpitNextActionItem | undefined {
  const order: Record<CockpitNextActionItem["priority"], number> = { high: 0, warning: 1, normal: 2 };
  return [...actions].sort((a, b) => order[a.priority] - order[b.priority])[0];
}

export const COCKPIT_HEALTH_LABEL: Record<CockpitHealthLevel, string> = {
  red: "주의 필요",
  yellow: "확인 권장",
  green: "정상",
};
