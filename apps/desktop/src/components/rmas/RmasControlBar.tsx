import { Loader2, Play, Square } from "lucide-react";
import { Button } from "../../ui/button";
import { Textarea } from "../../ui/textarea";

/**
 * Bottom bar: goal/RFP textarea + 실행 (disabled while running) + 중지 (only
 * while running). Elapsed timer + token counters live in the top bar / rail;
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
    <div className="flex flex-col gap-2 border-t border-border bg-card/40 p-3">
      <Textarea
        value={goal}
        onChange={(event) => onGoalChange(event.target.value)}
        placeholder="목표 또는 RFP를 입력하세요…"
        className="min-h-[72px] resize-y"
        disabled={running || busy}
        aria-label="목표 입력"
      />
      <div className="flex items-center justify-end gap-2">
        {running ? (
          <Button type="button" variant="destructive" onClick={onStop} className="gap-1.5">
            <Square className="h-4 w-4" />
            중지
          </Button>
        ) : null}
        <Button
          type="button"
          onClick={onRun}
          disabled={running || busy || !canRun}
          className="gap-1.5"
          title={!canRun ? "목표와 활성 에이전트가 필요합니다" : undefined}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          실행
        </Button>
      </div>
    </div>
  );
}
