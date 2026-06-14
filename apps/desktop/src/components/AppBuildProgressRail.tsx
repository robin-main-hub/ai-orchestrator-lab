import {
  Plus,
  Play,
  Eye,
  Wrench,
  ShieldCheck,
  GitPullRequest,
  CircleDashed,
  CircleDot,
  CircleCheck,
  CircleAlert,
  ChevronRight,
} from "lucide-react";
import {
  computeProgressRail,
  type ProgressInputs,
  type ProgressStage,
  type StageStatus,
} from "../lib/appBuildProgressRail";

/**
 * Mission Workspace 상단의 전체 여정 rail. StatusBar는 "다음 액션", 이건 "전체 흐름".
 * 자동 실행 0 — 표시 전용.
 */

const STAGE_ICON: Record<ProgressStage, React.ComponentType<{ size?: number }>> = {
  create: Plus,
  run: Play,
  qa: Eye,
  fix: Wrench,
  verify: ShieldCheck,
  publish: GitPullRequest,
};

const STATUS_ICON: Record<StageStatus, React.ComponentType<{ size?: number }>> = {
  not_started: CircleDashed,
  current: CircleDot,
  done: CircleCheck,
  blocked: CircleAlert,
};

export function AppBuildProgressRail({
  missionId,
  ...inputs
}: { missionId: string } & ProgressInputs) {
  const steps = computeProgressRail(inputs);
  return (
    <ol
      className="app-build-rail"
      data-testid={`app-build-rail-${missionId}`}
      aria-label="App Builder progress"
    >
      {steps.map((step, idx) => {
        const StageIcon = STAGE_ICON[step.stage];
        const StatusIcon = STATUS_ICON[step.status];
        const isLast = idx === steps.length - 1;
        return (
          <li
            key={step.stage}
            className={`app-build-rail__step app-build-rail__step--${step.status}`}
            data-testid={`app-build-rail-step-${missionId}-${step.stage}`}
            data-status={step.status}
          >
            <span className="app-build-rail__status-icon" aria-hidden="true">
              <StatusIcon size={11} />
            </span>
            <span className="app-build-rail__stage-icon" aria-hidden="true">
              <StageIcon size={10} />
            </span>
            <span className="app-build-rail__label">{step.label}</span>
            {!isLast ? (
              <ChevronRight size={10} className="app-build-rail__divider" aria-hidden="true" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
