import type { EventEnvelope } from "@ai-orchestrator/protocol";

/**
 * 작업극장 3단계 — 타임라인 되감기의 순수 코어.
 *
 * 세션의 보편 기록인 eventLog(EventEnvelope[])를 시간순 프레임으로 만들어, 스크러버
 * 위치(0..N)에 따라 "그 시점까지 일어난 일"을 영화처럼 되감을 수 있게 한다.
 * 렌더/타이머는 컴포넌트가 주입하므로 이 모듈은 순수·테스트 가능.
 */

export type TimelineCategory = "session" | "message" | "delegation" | "run" | "coding" | "permission" | "tmux" | "memory" | "system";

export type TimelineFrame = {
  index: number;
  id: string;
  type: string;
  label: string;
  category: TimelineCategory;
  at: string;
  /** 첫 프레임 기준 경과(ms) */
  elapsedMs: number;
};

const TYPE_LABEL: Record<string, string> = {
  "session.created": "세션 생성",
  "session.renamed": "세션 이름 변경",
  "coding_packet.created": "코딩 패킷 생성",
  "permission.requested": "승인 요청",
  "permission.approved": "승인됨",
  "permission.rejected": "거부됨",
  "runtime.ready": "런타임 준비",
  "tmux.dispatch.requested": "Tmux 실행 요청",
  "tmux.dispatch.approved": "Tmux 실행 승인",
  "tmux.dispatch.rejected": "Tmux 실행 거부",
  "tmux.capture.recorded": "Tmux 출력 캡처",
  "autonomy.run.started": "자율실행 시작",
  "autonomy.run.step": "자율실행 단계",
  "autonomy.run.completed": "자율실행 완료",
  "delegation.assignment.created": "위임 배정",
  "delegation.assignment.progressed": "위임 진행",
  "memory.curated": "기억 큐레이션",
};

/** 점 표기 타입의 접두로 카테고리 추정 */
export function timelineCategory(type: string): TimelineCategory {
  const head = type.split(".")[0];
  switch (head) {
    case "session":
      return "session";
    case "message":
    case "conversation":
      return "message";
    case "delegation":
      return "delegation";
    case "autonomy":
    case "run":
    case "parallel":
      return "run";
    case "coding_packet":
    case "coding":
      return "coding";
    case "permission":
      return "permission";
    case "tmux":
      return "tmux";
    case "memory":
      return "memory";
    default:
      return "system";
  }
}

export function timelineEventLabel(type: string): string {
  if (TYPE_LABEL[type]) return TYPE_LABEL[type];
  // "foo_bar.baz_qux" → "Foo bar · baz qux" 정도의 폴백
  const [head, tail] = type.split(".");
  const humanize = (value?: string) => (value ? value.replace(/_/g, " ") : "");
  return tail ? `${humanize(head)} · ${humanize(tail)}` : humanize(head) || type;
}

/** createdAt 오름차순으로 프레임 빌드 (안정 정렬, 동시각은 원래 순서 유지) */
export function buildTimelineFrames(events: ReadonlyArray<EventEnvelope>): TimelineFrame[] {
  const sorted = events
    .map((event, originalIndex) => ({ event, originalIndex }))
    .sort((a, b) => {
      const delta = Date.parse(a.event.createdAt) - Date.parse(b.event.createdAt);
      if (Number.isNaN(delta) || delta === 0) return a.originalIndex - b.originalIndex;
      return delta;
    });
  const firstAt = sorted.length > 0 ? Date.parse(sorted[0]!.event.createdAt) : 0;
  return sorted.map(({ event }, index) => {
    const at = Date.parse(event.createdAt);
    return {
      index,
      id: event.id,
      type: event.type,
      label: timelineEventLabel(event.type),
      category: timelineCategory(event.type),
      at: event.createdAt,
      elapsedMs: Number.isNaN(at) || Number.isNaN(firstAt) ? 0 : Math.max(0, at - firstAt),
    };
  });
}

export type TimelinePlayhead = {
  /** 현재 위치(0..frames.length-1). frames가 비면 -1 */
  position: number;
  /** 끝(live)에 있는가 */
  isLive: boolean;
  /** 현재 프레임 */
  current?: TimelineFrame;
  /** 지금까지 일어난 프레임 수 */
  occurred: number;
};

export function clampPlayhead(position: number, frameCount: number): number {
  if (frameCount <= 0) return -1;
  return Math.min(Math.max(Math.round(position), 0), frameCount - 1);
}

export function resolvePlayhead(frames: ReadonlyArray<TimelineFrame>, position: number): TimelinePlayhead {
  if (frames.length === 0) {
    return { position: -1, isLive: true, occurred: 0 };
  }
  const clamped = clampPlayhead(position, frames.length);
  return {
    position: clamped,
    isLive: clamped >= frames.length - 1,
    current: frames[clamped],
    occurred: clamped + 1,
  };
}

/** 스크럽 위치 기준 "일어난" 프레임만 (되감기 시 미래 이벤트 숨김) */
export function framesUpTo(frames: ReadonlyArray<TimelineFrame>, position: number): TimelineFrame[] {
  if (frames.length === 0) return [];
  const clamped = clampPlayhead(position, frames.length);
  return frames.slice(0, clamped + 1);
}

/** mm:ss.s 경과 표기 */
export function formatElapsed(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
