import { useState, type ComponentProps } from "react";
import { Bot, LayoutGrid } from "lucide-react";
import { AutonomyRunContainer } from "./AutonomyRunContainer";
import { ParallelMissionContainer } from "./ParallelMissionContainer";
import { cn } from "@/lib/utils";

/**
 * 실행 워크스페이스 — 자율실행(1)과 병렬실행(N)을 한 페이지로 합친 토글 셸.
 *
 * 둘 다 같은 페르소나 폐루프(스티키 Hermes 슬롯·human/auto_safe 게이트) 위의 얇은
 * 글루라, 1인 오너에게 최상위 탭 두 개는 과했다. 상단 세그먼트로 "1명 / N명"을
 * 전환한다. 모드별 컨테이너 props는 그대로 통과한다.
 */

export type RunMode = "single" | "parallel";

export function RunWorkspace({
  initialMode = "single",
  autonomyProps,
  parallelProps,
}: {
  initialMode?: RunMode;
  autonomyProps: ComponentProps<typeof AutonomyRunContainer>;
  parallelProps: ComponentProps<typeof ParallelMissionContainer>;
}) {
  const [mode, setMode] = useState<RunMode>(initialMode);
  return (
    <div className="run-workspace flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 px-4 pt-3">
        <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
          <RunModeButton
            active={mode === "single"}
            icon={Bot}
            label="자율 · 1명"
            onClick={() => setMode("single")}
          />
          <RunModeButton
            active={mode === "parallel"}
            icon={LayoutGrid}
            label="병렬 · N명"
            onClick={() => setMode("parallel")}
          />
        </div>
        <span className="text-[11px] text-zinc-500">
          {mode === "single" ? "페르소나 1명에게 미션을 맡기고 폐루프로 완주" : "여러 에이전트를 각자의 터미널에서 동시 가동"}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        {mode === "single" ? (
          <AutonomyRunContainer {...autonomyProps} />
        ) : (
          <ParallelMissionContainer {...parallelProps} />
        )}
      </div>
    </div>
  );
}

function RunModeButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Bot;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition",
        active ? "bg-violet-400/15 text-violet-100 shadow-[0_0_16px_rgba(167,139,250,0.12)]" : "text-zinc-400 hover:text-zinc-100",
      )}
      onClick={onClick}
      type="button"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
