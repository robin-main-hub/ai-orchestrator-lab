import { useState, type ComponentProps } from "react";
import { Bot, ClipboardList, LayoutGrid } from "lucide-react";
import { AutonomyRunContainer } from "./AutonomyRunContainer";
import { MissionBoardContainer } from "./MissionBoardContainer";
import { ParallelMissionContainer } from "./ParallelMissionContainer";
import { cn } from "@/lib/utils";

/**
 * 실행 워크스페이스 — 자율실행(1)·병렬실행(N)·미션 보드(서버 영속)를 한
 * 페이지로 합친 토글 셸.
 *
 * 셋 다 같은 페르소나 폐루프(스티키 Hermes 슬롯·human/auto_safe 게이트) 위의 얇은
 * 글루라, 1인 오너에게 최상위 탭 세 개는 과했다. 상단 세그먼트로 전환한다.
 * 모드별 컨테이너 props는 그대로 통과한다.
 */

export type RunMode = "single" | "parallel" | "board";

export function RunWorkspace({
  initialMode = "single",
  autonomyProps,
  parallelProps,
  boardProps,
}: {
  initialMode?: RunMode;
  autonomyProps: ComponentProps<typeof AutonomyRunContainer>;
  parallelProps: ComponentProps<typeof ParallelMissionContainer>;
  boardProps?: ComponentProps<typeof MissionBoardContainer>;
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
          <RunModeButton
            active={mode === "board"}
            icon={ClipboardList}
            label="미션 보드"
            onClick={() => setMode("board")}
          />
        </div>
        <span className="text-[11px] text-zinc-500">
          {mode === "single"
            ? "페르소나 1명에게 미션을 맡기고 폐루프로 완주"
            : mode === "parallel"
              ? "여러 에이전트를 각자의 터미널에서 동시 가동"
              : "DGX에 영속화된 미션 · 검증 · 병합 대기열"}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {mode === "single" ? (
          <AutonomyRunContainer {...autonomyProps} />
        ) : mode === "parallel" ? (
          <ParallelMissionContainer {...parallelProps} />
        ) : (
          <MissionBoardContainer {...(boardProps ?? {})} />
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
