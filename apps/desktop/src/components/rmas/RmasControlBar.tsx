import { Loader2, Play, Square } from "lucide-react";

/**
 * Bottom bar: goal/RFP textarea + 실행 (disabled while running) + 중지 (only
 * while running). Elapsed timer + token counters live in the header / rail;
 * this component owns the goal draft and the run/stop actions.
 */
export function RmasControlBar({
  goal,
  onGoalChange,
  onRun,
  onStop,
  running,
  busy,
  canRun,
}: {
  goal: string;
  onGoalChange: (value: string) => void;
  onRun: () => void;
  onStop: () => void;
  running: boolean;
  busy: boolean;
  canRun: boolean;
}) {
  return (
    <div className="rmas__bar">
      <textarea
        className="rmas__goal"
        value={goal}
        onChange={(event) => onGoalChange(event.target.value)}
        placeholder="목표 또는 RFP를 입력하세요…"
        disabled={running || busy}
        aria-label="목표 입력"
      />
      <div className="rmas__bar-actions">
        {running ? (
          <button type="button" className="rmas__btn rmas__btn--stop" onClick={onStop}>
            <Square className="h-4 w-4" aria-hidden />
            중지
          </button>
        ) : null}
        <button
          type="button"
          className="rmas__btn rmas__btn--run"
          onClick={onRun}
          disabled={running || busy || !canRun}
          title={!canRun ? "목표와 활성 에이전트가 필요합니다" : undefined}
        >
          {busy ? (
            <Loader2 className="rmas__spin h-4 w-4" aria-hidden />
          ) : (
            <Play className="h-4 w-4" aria-hidden />
          )}
          실행
        </button>
      </div>
    </div>
  );
}
