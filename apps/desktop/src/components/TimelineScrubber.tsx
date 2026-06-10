import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Code2,
  Database,
  FileText,
  Pause,
  Play,
  Radio,
  Rewind,
  ShieldCheck,
  SkipBack,
  SkipForward,
  TerminalSquare,
  Users,
} from "lucide-react";
import type { EventEnvelope } from "@ai-orchestrator/protocol";
import {
  buildTimelineFrames,
  formatElapsed,
  resolvePlayhead,
  type TimelineCategory,
} from "../lib/eventTimeline";
import { cn } from "@/lib/utils";

/**
 * 작업극장 3단계 — 타임라인 되감기 스크러버.
 * 세션 eventLog를 시간순 필름으로 만들어, 드래그/재생/스텝으로 "모든 작업"을
 * 영화처럼 되감는다. 위치가 바뀌면 onScrub(asOfIndex, isLive)로 알려 다른 화면이
 * 그 시점 상태를 반영할 수 있게 한다. 코어는 lib/eventTimeline.ts(테스트됨).
 */

const CATEGORY_META: Record<TimelineCategory, { icon: typeof Bot; tone: string; dot: string }> = {
  session: { icon: FileText, tone: "text-zinc-300", dot: "bg-zinc-400" },
  message: { icon: Users, tone: "text-cyan-200", dot: "bg-cyan-400" },
  delegation: { icon: Users, tone: "text-violet-200", dot: "bg-violet-400" },
  run: { icon: Bot, tone: "text-violet-200", dot: "bg-violet-400" },
  coding: { icon: Code2, tone: "text-teal-200", dot: "bg-teal-300" },
  permission: { icon: ShieldCheck, tone: "text-amber-200", dot: "bg-amber-400" },
  tmux: { icon: TerminalSquare, tone: "text-pink-200", dot: "bg-pink-400" },
  memory: { icon: Database, tone: "text-emerald-200", dot: "bg-emerald-400" },
  system: { icon: Radio, tone: "text-zinc-400", dot: "bg-zinc-500" },
};

export function TimelineScrubber({
  events,
  onScrub,
}: {
  events: ReadonlyArray<EventEnvelope>;
  /** 스크럽 위치 변경 통지 (asOfIndex = 그 시점까지 포함, isLive = 끝) */
  onScrub?: (asOfIndex: number, isLive: boolean) => void;
}) {
  const frames = useMemo(() => buildTimelineFrames(events), [events]);
  const [position, setPosition] = useState<number>(() => Math.max(0, frames.length - 1));
  const [playing, setPlaying] = useState(false);
  const wasLiveRef = useRef(true);

  // 새 이벤트가 들어오면 — live를 따라가던 중이면 끝으로 점프, 아니면 위치 유지
  useEffect(() => {
    setPosition((current) => {
      if (frames.length === 0) return 0;
      if (wasLiveRef.current) return frames.length - 1;
      return Math.min(current, frames.length - 1);
    });
  }, [frames.length]);

  const playhead = resolvePlayhead(frames, position);
  wasLiveRef.current = playhead.isLive;

  useEffect(() => {
    onScrub?.(playhead.position, playhead.isLive);
  }, [playhead.position, playhead.isLive, onScrub]);

  // 재생 — 1초당 한 프레임 전진, 끝에서 멈춤
  useEffect(() => {
    if (!playing || frames.length === 0) return;
    const timer = window.setInterval(() => {
      setPosition((current) => {
        if (current >= frames.length - 1) {
          setPlaying(false);
          return frames.length - 1;
        }
        return current + 1;
      });
    }, 900);
    return () => window.clearInterval(timer);
  }, [playing, frames.length]);

  if (frames.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-[11px] text-zinc-500">
        <Rewind className="h-3.5 w-3.5" />
        아직 기록된 이벤트가 없습니다 — 작업이 시작되면 여기서 영화처럼 되감을 수 있어요.
      </div>
    );
  }

  const current = playhead.current!;
  const meta = CATEGORY_META[current.category];
  const Icon = meta.icon;
  const step = (delta: number) => {
    setPlaying(false);
    setPosition((value) => Math.min(Math.max(value + delta, 0), frames.length - 1));
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/50 px-4 py-3">
      <div className="flex items-center gap-3">
        <button
          aria-label="처음으로"
          className="rounded-md p-1 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
          onClick={() => step(-frames.length)}
          type="button"
        >
          <SkipBack className="h-3.5 w-3.5" />
        </button>
        <button
          aria-label={playing ? "일시정지" : "재생"}
          className="rounded-md p-1 text-zinc-100 hover:bg-white/5"
          onClick={() => setPlaying((value) => !value)}
          type="button"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button
          aria-label="끝(LIVE)으로"
          className="rounded-md p-1 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
          onClick={() => step(frames.length)}
          type="button"
        >
          <SkipForward className="h-3.5 w-3.5" />
        </button>

        <input
          aria-label="타임라인 위치"
          className="min-w-0 flex-1 accent-violet-400"
          max={frames.length - 1}
          min={0}
          onChange={(event) => {
            setPlaying(false);
            setPosition(Number(event.target.value));
          }}
          step={1}
          type="range"
          value={playhead.position}
        />

        <span className="shrink-0 font-mono text-[11px] text-zinc-400">
          {playhead.occurred}/{frames.length}
        </span>
        {playhead.isLive ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full border border-emerald-300/30 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> LIVE
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-1 rounded-full border border-amber-300/30 px-1.5 py-0.5 text-[9px] font-semibold text-amber-200">
            <Rewind className="h-2.5 w-2.5" /> 되감기
          </span>
        )}
      </div>

      <div className="flex items-center gap-2.5 border-t border-white/5 pt-2">
        <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]", meta.tone)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("truncate text-[12px] font-medium", meta.tone)}>{current.label}</p>
          <p className="truncate font-mono text-[10px] text-zinc-600">{current.type}</p>
        </div>
        <span className="shrink-0 font-mono text-[10.5px] text-zinc-500">+{formatElapsed(current.elapsedMs)}</span>
      </div>
    </div>
  );
}
