import { deriveDebateDecisionReadiness } from "../../lib/debateDecisionReadiness";
import type { Stage3DebateSession } from "../../runtime/stage3Runtime";

function runStateLabel(runState: Stage3DebateSession["runState"]): string | null {
  switch (runState) {
    case "mock":
      return "데모";
    case "running":
      return "호출 중";
    case "live":
      return "실시간";
    case "error":
      return "오류";
    default:
      return null;
  }
}

export function AnnexReadinessGauge({ session }: { session: Stage3DebateSession }) {
  const readiness = deriveDebateDecisionReadiness(session);
  const runLabel = runStateLabel(session.runState);

  return (
    <div className="annex-v2__gauge" data-state={readiness.state}>
      <div className="annex-v2__gauge-head">
        <span className="annex-v2__gauge-label">결정 준비</span>
        {runLabel ? <span className="aol-mono annex-v2__gauge-run">{runLabel}</span> : null}
      </div>
      <div className="annex-v2__gauge-meter" aria-hidden="true">
        <span className="annex-v2__gauge-fill" />
      </div>
      <p className="annex-v2__gauge-headline">{readiness.headline}</p>
      <p className="annex-v2__gauge-next">{readiness.nextActionLabel}</p>
    </div>
  );
}
