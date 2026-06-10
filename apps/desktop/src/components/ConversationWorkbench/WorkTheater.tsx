import { AlertTriangle, Check } from "lucide-react";
import type { WorkbenchAgent } from "../../types";
import type { MakimaDelegationAssignmentView, MakimaDelegationCard } from "../../lib/makimaDelegation";
import { resolvePersonaPortraitUrl } from "../../lib/personaPortrait";
import {
  deriveTheaterRows,
  stageStateAt,
  summarizeTheater,
  THEATER_STAGES,
  type TheaterRow,
  type TheaterStageState,
} from "../../lib/workTheater";
import { cn } from "@/lib/utils";

/**
 * 작업극장 1단계 — 누가 어느 단계에서 무슨 작업을 하는지, 캐릭터 초상화와 함께 한
 * 화면으로. v0가 깎는 풀스크린 비주얼이 도착하면 이 데이터 배선을 그대로 재사용한다.
 * (라이브 터미널은 별도 "터미널" 모드, 위임 실행/승인은 "백그라운드 작업" 모드.)
 */
export function WorkTheater({
  cards,
  assignmentsByAgentId,
  agents,
  onOpenAgent,
}: {
  cards: ReadonlyArray<MakimaDelegationCard>;
  assignmentsByAgentId?: Record<string, MakimaDelegationAssignmentView>;
  agents: ReadonlyArray<WorkbenchAgent>;
  onOpenAgent?: (agentId: string) => void;
}) {
  const rows = deriveTheaterRows({
    cards,
    assignmentsByAgentId,
    agents,
    resolvePortrait: resolvePersonaPortraitUrl,
  });

  if (rows.length === 0) {
    return (
      <p className="p-6 text-center text-[12.5px] leading-relaxed text-zinc-500">
        지휘자에게 요청을 보내면 작업 분해 계획이 작전 무대에 오릅니다.
        <br />
        누가 어느 단계에서 무슨 일을 하는지 여기서 봅니다.
      </p>
    );
  }

  const summary = summarizeTheater(rows);

  return (
    <div className="flex flex-col gap-3 p-3">
      <header className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="font-semibold text-zinc-200">作戦無台 · 작전 무대</span>
        <span className="flex-1" />
        <SummonStat label="출격" value={summary.deployed} tone="cyan" />
        <SummonStat label="승인대기" value={summary.awaitingApproval} tone="amber" />
        <SummonStat label="완료" value={summary.done} tone="emerald" />
        {summary.blocked > 0 ? <SummonStat label="막힘" value={summary.blocked} tone="rose" /> : null}
      </header>

      <ol className="flex flex-col gap-2.5">
        {rows.map((row) => (
          <TheaterRowCard key={row.agentId} row={row} onOpen={onOpenAgent} />
        ))}
      </ol>
    </div>
  );
}

function SummonStat({ label, value, tone }: { label: string; value: number; tone: "cyan" | "amber" | "emerald" | "rose" }) {
  const toneClass = {
    cyan: "border-cyan-300/30 text-cyan-200",
    amber: "border-amber-300/30 text-amber-200",
    emerald: "border-emerald-300/30 text-emerald-200",
    rose: "border-rose-300/30 text-rose-200",
  }[tone];
  return (
    <span className={cn("rounded-full border px-2 py-0.5 text-[10px]", toneClass)}>
      {label} {value}
    </span>
  );
}

function TheaterRowCard({ row, onOpen }: { row: TheaterRow; onOpen?: (agentId: string) => void }) {
  const interactive = Boolean(onOpen && row.assigned);
  return (
    <li
      className={cn(
        "rounded-xl border border-white/10 bg-white/[0.03] p-3",
        interactive && "cursor-pointer transition-colors hover:border-violet-300/30 hover:bg-white/[0.05]",
      )}
      onClick={interactive ? () => onOpen?.(row.agentId) : undefined}
    >
      <div className="flex items-start gap-2.5">
        {row.portraitUrl ? (
          <img
            alt={row.name}
            className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-white/10"
            loading="lazy"
            src={row.portraitUrl}
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-[12px] font-bold text-violet-200">
            {row.name.slice(0, 2)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <p className="truncate text-[13px] font-semibold text-zinc-100">{row.name}</p>
            <span className="shrink-0 text-[10.5px] text-cyan-200">{row.roleLabel}</span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-zinc-400">{row.title}</p>
        </div>
      </div>

      <TheaterPipeline stageIndex={row.stageIndex} blocked={row.blocked} />
    </li>
  );
}

/** 6단계 作戦ログ 파이프라인 스트립 */
function TheaterPipeline({ stageIndex, blocked }: { stageIndex: number; blocked: boolean }) {
  return (
    <div className="mt-2.5 flex items-center gap-1">
      {THEATER_STAGES.map((stage, index) => {
        const state = stageStateAt(index, stageIndex, blocked);
        return (
          <div className="flex flex-1 flex-col items-center gap-1" key={stage.key} title={`${stage.jp} ${stage.ko}`}>
            <div className="flex w-full items-center">
              <StageDot state={state} />
              {index < THEATER_STAGES.length - 1 ? (
                <span className={cn("h-px flex-1", index < stageIndex ? "bg-cyan-300/40" : "bg-white/10")} />
              ) : null}
            </div>
            <span className={cn("text-[8.5px] tracking-tight", stageLabelClass(state))}>{stage.ko}</span>
          </div>
        );
      })}
    </div>
  );
}

function StageDot({ state }: { state: TheaterStageState }) {
  if (state === "blocked") {
    return (
      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-rose-500/25 text-rose-300">
        <AlertTriangle className="h-2 w-2" />
      </span>
    );
  }
  if (state === "done") {
    return (
      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-cyan-400/25 text-cyan-200">
        <Check className="h-2 w-2" />
      </span>
    );
  }
  if (state === "active") {
    return <span className="h-3.5 w-3.5 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.7)]" />;
  }
  return <span className="h-3.5 w-3.5 rounded-full border border-white/15 bg-transparent" />;
}

function stageLabelClass(state: TheaterStageState): string {
  switch (state) {
    case "done":
      return "text-cyan-200/70";
    case "active":
      return "font-semibold text-violet-200";
    case "blocked":
      return "text-rose-300";
    default:
      return "text-zinc-600";
  }
}
