import { Sparkles, Eye, AlertTriangle, Wrench, CheckCircle2, ShieldAlert, ArrowRight } from "lucide-react";
import {
  computeMissionWorkspaceStatus,
  type MissionWorkspacePhase,
  type MissionWorkspaceStatusInputs,
} from "../lib/missionWorkspaceStatus";

/**
 * Mission Workspace 상단의 한 줄 상태 요약 + 다음 행동 CTA. 자동 실행 0.
 *
 * 정직성:
 *   - 상태는 계산기에서 결정적으로 도출. 추측 X.
 *   - phase별 한 줄 headline + 한 개 CTA(추천 행동 1개). 사용자가 눌러야만 라우터가 동작.
 */

const PHASE_ICON: Record<MissionWorkspacePhase, React.ComponentType<{ size?: number }>> = {
  blocked_no_scaffold: ShieldAlert,
  build_ready: Sparkles,
  preview_running: Eye,
  preview_failed: ShieldAlert,
  qa_failed: ShieldAlert,
  qa_blocked: ShieldAlert,
  qa_issues_found: AlertTriangle,
  fix_applied_verification_needed: Wrench,
  verify_needs_fix: Wrench,
  publish_ready: CheckCircle2,
};

const ACTION_LABEL = {
  publish: "Publish Panel로 이동",
  fix: "수정안 섹션으로 이동",
  preview: "Preview 실행 섹션으로 이동",
  qa: "Visual QA 실행 섹션으로 이동",
  none: "",
} as const;

export function MissionWorkspaceStatusBar({
  missionId,
  onNavigate,
  ...inputs
}: {
  missionId: string;
  onNavigate?: (target: "publish" | "fix" | "preview" | "qa") => void;
} & MissionWorkspaceStatusInputs) {
  const status = computeMissionWorkspaceStatus(inputs);
  const Icon = PHASE_ICON[status.phase];
  const action = status.recommendedAction;
  return (
    <div
      className={`mws-bar mws-bar--${status.phase}`}
      data-testid={`mws-bar-${missionId}`}
      data-phase={status.phase}
      data-action={action}
    >
      <span className="mws-bar__icon">
        <Icon size={14} />
      </span>
      <strong className="mws-bar__label" data-testid={`mws-bar-label-${missionId}`}>
        {status.label}
      </strong>
      <span className="mws-bar__headline" data-testid={`mws-bar-headline-${missionId}`}>
        {status.headline}
      </span>
      {action !== "none" && onNavigate ? (
        <button
          type="button"
          onClick={() => onNavigate(action)}
          data-testid={`mws-bar-cta-${missionId}`}
          className="mws-bar__cta"
          title="자동 실행은 하지 않습니다 — 해당 섹션으로 이동만 합니다."
        >
          {ACTION_LABEL[action]} <ArrowRight size={11} />
        </button>
      ) : null}
    </div>
  );
}
