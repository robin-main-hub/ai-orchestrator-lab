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
  frameTicksByCategory,
  formatElapsed,
  resolvePlayhead,
  type TimelineCategory,
} from "../lib/eventTimeline";
import { cn } from "@/lib/utils";

/**
 * 작업극장 3단계 — 타임라인 되감기 스크러버 v2.
 * 세션 eventLog를 시간순 필름으로 만들어, 드래그/재생/스텝으로 "모든 작업"을 영화처럼
 * 되감는다. 위치가 바뀌면 onScrub(asOfIndex, isLive)로 알려 다른 화면이 그 시점 상태를
 * 반영한다. 밀도 틱 스트립은 frameTicksByCategory 순수 파생, 카테고리 구분은 색이 아니라
 * 아이콘(단일 액센트 규율). goLiveSignal이 증가하면 끝(LIVE)으로 점프. 코어는 lib/eventTimeline.ts.
 */

/** 카테고리 → lucide 아이콘 (색이 아니라 아이콘으로 구분 — 단일 액센트 규율) */
const CATEGORY_ICON: Record<TimelineCategory, typeof Bot> = {
  session: FileText,
  message: Users,
  delegation: Users,
  run: Bot,
  coding: Code2,
  permission: ShieldCheck,
  tmux: TerminalSquare,
  memory: Database,
  system: Radio,
};

/** 밀도 틱 버킷 수(§2.7 "밀도 틱") — 프레임 수로 클램프 */
const TICK_BUCKETS = 32;

export function TimelineScrubber({
  events,
  onScrub,
  goLiveSignal,
}: {
  events: ReadonlyArray<EventEnvelope>;
  /** 스크럽 위치 변경 통지 (asOfIndex = 그 시점까지 포함, isLive = 끝) */
  onScrub?: (asOfIndex: number, isLive: boolean) => void;
  /** 증가하면 끝(LIVE)으로 점프 + 재생 정지 — 헤더 "LIVE로" 명령용 */
  goLiveSignal?: number;
}) {
  const frames = useMemo(() => buildTimelineFrames(events), [events]);
  const [position, setPosition] = useState<number>(() => Math.max(0, frames.length - 1));
  const [playing, setPlaying] = useState(false);
  const wasLiveRef = useRef(true);
  const framesLenRef = useRef(frames.length);
  framesLenRef.current = frames.length;

  // 밀도 틱 — 버킷 수를 프레임 수로 클램프(빈 버킷 난립 방지)
  const ticks = useMemo(() => frameTicksByCategory(frames, Math.min(TICK_BUCKETS, frames.length)), [frames]);

  // 새 이벤트가 들어오면 — live를 따라가던 중이면 끝으로 점프, 아니면 위치 유지
  useEffect(() => {
    setPosition((current) => {
      if (frames.length === 0) return 0;
      if (wasLiveRef.current) return frames.length - 1;
      return Math.min(current, frames.length - 1);
    });
  }, [frames.length]);

  // goLiveSignal 증가 → 끝으로 점프 + 정지 (헤더 LIVE로 버튼). ref로 최신 길이 참조(스테일 클로저 회피)
  useEffect(() => {
    if (goLiveSignal === undefined) return;
    setPlaying(false);
    setPosition(Math.max(0, framesLenRef.current - 1));
  }, [goLiveSignal]);

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
      <div className="theater-v2__scrub theater-v2__scrub--empty">
        <Rewind aria-hidden className="h-3.5 w-3.5" />
        아직 기록된 이벤트가 없습니다 · 작업이 시작되면 여기서 영화처럼 되감을 수 있어요.
      </div>
    );
  }

  const current = playhead.current!;
  const Icon = CATEGORY_ICON[current.category];
  const maxTickCount = ticks.reduce((max, tick) => Math.max(max, tick.count), 0);
  const currentBucket = bucketIndexOf(frames, current.elapsedMs, ticks.length);
  const step = (delta: number) => {
    setPlaying(false);
    setPosition((value) => Math.min(Math.max(value + delta, 0), frames.length - 1));
  };

  return (
    <div className="theater-v2__scrub">
      <div className="theater-v2__scrub-controls">
        <button aria-label="처음으로" className="theater-v2__scrub-btn" onClick={() => step(-frames.length)} type="button">
          <SkipBack className="h-3.5 w-3.5" />
        </button>
        <button
          aria-label={playing ? "일시정지" : "재생"}
          className="theater-v2__scrub-btn theater-v2__scrub-btn--primary"
          onClick={() => setPlaying((value) => !value)}
          type="button"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button aria-label="끝(LIVE)으로" className="theater-v2__scrub-btn" onClick={() => step(frames.length)} type="button">
          <SkipForward className="h-3.5 w-3.5" />
        </button>

        <div className="theater-v2__scrub-rail">
          {ticks.length > 0 ? (
            <div aria-hidden className="theater-v2__scrub-ticks">
              {ticks.map((tick) => (
                <span
                  className={cn("theater-v2__scrub-tick", tick.bucket === currentBucket && "theater-v2__scrub-tick--current")}
                  key={tick.bucket}
                  style={{ height: `${maxTickCount > 0 ? (tick.count / maxTickCount) * 100 : 0}%` }}
                />
              ))}
            </div>
          ) : null}
          <input
            aria-label="타임라인 위치"
            className="theater-v2__scrub-range"
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
        </div>

        <span className="theater-v2__scrub-count aol-mono">
          {playhead.occurred}/{frames.length}
        </span>
        {playhead.isLive ? (
          <span className="theater-v2__scrub-pill theater-v2__scrub-live">
            <span aria-hidden className="theater-v2__scrub-live-dot" /> LIVE
          </span>
        ) : (
          <span className="theater-v2__scrub-pill theater-v2__scrub-rewind">
            <Rewind aria-hidden className="h-2.5 w-2.5" /> 되감기
          </span>
        )}
      </div>

      <div className="theater-v2__scrub-frame">
        <span className="theater-v2__scrub-frame-icon">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="theater-v2__scrub-frame-label truncate">{current.label}</p>
          <p className="theater-v2__scrub-frame-type aol-mono truncate">{current.type}</p>
        </div>
        <span className="theater-v2__scrub-frame-elapsed aol-mono">+{formatElapsed(current.elapsedMs)}</span>
      </div>
    </div>
  );
}

/** 현재 프레임이 속한 밀도 틱 버킷 — frameTicksByCategory와 동일한 버킷 산식(정합 보장) */
function bucketIndexOf(frames: ReadonlyArray<{ elapsedMs: number }>, elapsedMs: number, bucketCount: number): number {
  if (bucketCount <= 0 || frames.length === 0) return -1;
  const first = frames[0]!.elapsedMs;
  const last = frames[frames.length - 1]!.elapsedMs;
  const span = last - first;
  if (span <= 0) return 0;
  return Math.min(bucketCount - 1, Math.max(0, Math.floor(((elapsedMs - first) / span) * bucketCount)));
}
