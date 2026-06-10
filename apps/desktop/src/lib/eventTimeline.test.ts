import { describe, expect, it } from "vitest";
import type { EventEnvelope } from "@ai-orchestrator/protocol";
import {
  buildTimelineFrames,
  clampPlayhead,
  formatElapsed,
  framesUpTo,
  resolvePlayhead,
  timelineCategory,
  timelineEventLabel,
} from "./eventTimeline";

function ev(id: string, type: string, createdAt: string): EventEnvelope {
  return { id, sessionId: "s1", type, payload: {}, createdAt, source: "desktop", sourceTrust: "trusted", redacted: false };
}

describe("timelineCategory / label", () => {
  it("타입 접두로 카테고리 분류", () => {
    expect(timelineCategory("session.created")).toBe("session");
    expect(timelineCategory("tmux.dispatch.requested")).toBe("tmux");
    expect(timelineCategory("autonomy.run.step")).toBe("run");
    expect(timelineCategory("weird.unknown")).toBe("system");
  });
  it("알려진 타입은 한글 라벨, 미지 타입은 humanize 폴백", () => {
    expect(timelineEventLabel("coding_packet.created")).toBe("코딩 패킷 생성");
    expect(timelineEventLabel("foo_bar.baz_qux")).toBe("foo bar · baz qux");
  });
});

describe("buildTimelineFrames", () => {
  it("createdAt 오름차순 정렬 + elapsedMs 계산", () => {
    const frames = buildTimelineFrames([
      ev("b", "permission.requested", "2026-06-11T00:00:05.000Z"),
      ev("a", "session.created", "2026-06-11T00:00:00.000Z"),
      ev("c", "coding_packet.created", "2026-06-11T00:00:12.000Z"),
    ]);
    expect(frames.map((f) => f.id)).toEqual(["a", "b", "c"]);
    expect(frames[0]!.elapsedMs).toBe(0);
    expect(frames[1]!.elapsedMs).toBe(5000);
    expect(frames[2]!.elapsedMs).toBe(12000);
    expect(frames[0]!.index).toBe(0);
  });
  it("동시각은 원래 순서 유지 (안정 정렬)", () => {
    const frames = buildTimelineFrames([
      ev("x", "a.b", "2026-06-11T00:00:00.000Z"),
      ev("y", "a.b", "2026-06-11T00:00:00.000Z"),
    ]);
    expect(frames.map((f) => f.id)).toEqual(["x", "y"]);
  });
  it("빈 입력은 빈 프레임", () => {
    expect(buildTimelineFrames([])).toEqual([]);
  });
});

describe("playhead", () => {
  const frames = buildTimelineFrames([
    ev("a", "session.created", "2026-06-11T00:00:00.000Z"),
    ev("b", "permission.requested", "2026-06-11T00:00:05.000Z"),
    ev("c", "coding_packet.created", "2026-06-11T00:00:12.000Z"),
  ]);

  it("clamp는 [0, n-1], 빈 건 -1", () => {
    expect(clampPlayhead(99, 3)).toBe(2);
    expect(clampPlayhead(-5, 3)).toBe(0);
    expect(clampPlayhead(1, 0)).toBe(-1);
  });

  it("resolvePlayhead: 끝이면 live, occurred 카운트", () => {
    const mid = resolvePlayhead(frames, 1);
    expect(mid.isLive).toBe(false);
    expect(mid.occurred).toBe(2);
    expect(mid.current?.id).toBe("b");
    const end = resolvePlayhead(frames, 2);
    expect(end.isLive).toBe(true);
    const empty = resolvePlayhead([], 0);
    expect(empty.position).toBe(-1);
    expect(empty.isLive).toBe(true);
  });

  it("framesUpTo: 되감기 시 미래 이벤트 숨김", () => {
    expect(framesUpTo(frames, 0).map((f) => f.id)).toEqual(["a"]);
    expect(framesUpTo(frames, 1).map((f) => f.id)).toEqual(["a", "b"]);
  });
});

describe("formatElapsed", () => {
  it("mm:ss", () => {
    expect(formatElapsed(0)).toBe("00:00");
    expect(formatElapsed(65000)).toBe("01:05");
  });
});
