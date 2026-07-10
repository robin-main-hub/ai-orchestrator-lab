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

/** 밀도 틱 한 칸 — 스크러버 위 카테고리 밀도 스트립의 한 버킷 */
export type TimelineTick = {
  bucket: number;
  count: number;
  dominant: TimelineCategory;
  startMs: number;
  endMs: number;
};

/**
 * 밀도 틱(§2.7 "밀도 틱") — 스크러버 밀도 스트립의 순수 파생.
 *
 * 타임라인 스팬 [frames[0].elapsedMs, frames[N-1].elapsedMs]을 `buckets`개의 균등
 * 구간으로 쪼개 각 프레임을 elapsedMs로 배정한다(경계값은 오른쪽 버킷으로, 마지막
 * 프레임은 반드시 마지막 버킷). 각 틱: 프레임 수(count) · 최빈 카테고리(dominant,
 * 동률이면 버킷 안 가장 이른 프레임의 카테고리) · 구간 경계(startMs/endMs). 빈 버킷은
 * count 0 · dominant "system". 스팬이 0(전 프레임 동일 시각 또는 단일 프레임)이면 전부
 * 버킷 0에 넣고 나머지 버킷은 비운다. `buckets <= 0` 또는 빈 프레임이면 [].
 *
 * 렌더/정규화는 컴포넌트가 주입하므로 순수·테스트 가능(eventTimeline.test.ts).
 */
export function frameTicksByCategory(frames: ReadonlyArray<TimelineFrame>, buckets: number): TimelineTick[] {
  const bucketCount = Math.floor(buckets);
  if (bucketCount <= 0 || frames.length === 0) return [];

  const first = frames[0]!.elapsedMs;
  const last = frames[frames.length - 1]!.elapsedMs;
  const span = last - first;
  const width = span / bucketCount;

  const grouped: TimelineFrame[][] = Array.from({ length: bucketCount }, () => []);
  for (const frame of frames) {
    const bucket =
      span <= 0
        ? 0
        : Math.min(bucketCount - 1, Math.max(0, Math.floor(((frame.elapsedMs - first) / span) * bucketCount)));
    grouped[bucket]!.push(frame);
  }

  return grouped.map((bucketFrames, bucket) => ({
    bucket,
    count: bucketFrames.length,
    dominant: dominantTickCategory(bucketFrames),
    startMs: span <= 0 ? first : first + bucket * width,
    endMs: span <= 0 ? first : first + (bucket + 1) * width,
  }));
}

/** 버킷 최빈 카테고리 — 동률이면 가장 이른(배열 앞) 프레임의 카테고리, 빈 버킷은 "system" */
function dominantTickCategory(bucketFrames: ReadonlyArray<TimelineFrame>): TimelineCategory {
  if (bucketFrames.length === 0) return "system";
  const counts = new Map<TimelineCategory, number>();
  for (const frame of bucketFrames) {
    counts.set(frame.category, (counts.get(frame.category) ?? 0) + 1);
  }
  let maxCount = 0;
  for (const value of counts.values()) {
    if (value > maxCount) maxCount = value;
  }
  // 동률 → 가장 이른 프레임(배열 순서) 중 max에 속한 첫 카테고리
  for (const frame of bucketFrames) {
    if ((counts.get(frame.category) ?? 0) === maxCount) return frame.category;
  }
  return bucketFrames[0]!.category;
}
