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

// Characterization tests for the previously-uncovered category heads, label
// fallbacks, bad-date elapsed handling, and playhead/format edge branches (no
// behavior change). The existing suite pins a few representative cases; these
// pin the remaining timelineCategory heads/aliases, an alternate known label and
// the no-dot humanize fallback, that an unparseable createdAt yields elapsedMs 0
// (and a bad FIRST event zeroes every frame), clampPlayhead's Math.round, the
// negative/over-end playhead clamps, framesUpTo empty/over-end, and that
// formatElapsed floors sub-seconds with no decimal despite the mm:ss.s doc.
describe("eventTimeline — category heads, label fallback & edge characterization", () => {
  it("classifies the remaining heads and aliases", () => {
    expect(timelineCategory("conversation.message_added")).toBe("message");
    expect(timelineCategory("message.created")).toBe("message");
    expect(timelineCategory("delegation.assignment.created")).toBe("delegation");
    expect(timelineCategory("run.started")).toBe("run");
    expect(timelineCategory("parallel.mission.spawned")).toBe("run");
    expect(timelineCategory("coding.turn")).toBe("coding");
    expect(timelineCategory("memory.curated")).toBe("memory");
    expect(timelineCategory("permission.approved")).toBe("permission");
  });

  it("prefers a known label and humanizes a no-dot type via the head fallback", () => {
    expect(timelineEventLabel("permission.approved")).toBe("승인됨");
    expect(timelineEventLabel("boot_sequence")).toBe("boot sequence");
    expect(timelineEventLabel("ready")).toBe("ready");
  });

  it("treats an unparseable createdAt as elapsedMs 0 while keeping stable order", () => {
    const frames = buildTimelineFrames([
      ev("a", "session.created", "2026-06-11T00:00:00.000Z"),
      ev("bad", "x.y", "not-a-date"),
    ]);
    expect(frames.map((f) => f.id)).toEqual(["a", "bad"]);
    expect(frames[1]!.elapsedMs).toBe(0);
  });

  it("zeroes every elapsedMs when the first (oldest) frame has an unparseable date", () => {
    const frames = buildTimelineFrames([
      ev("bad", "x.y", "not-a-date"),
      ev("a", "session.created", "2026-06-11T00:00:00.000Z"),
    ]);
    expect(frames.map((f) => f.id)).toEqual(["bad", "a"]);
    expect(frames.map((f) => f.elapsedMs)).toEqual([0, 0]);
  });

  it("rounds a fractional clampPlayhead position to the nearest frame", () => {
    expect(clampPlayhead(1.4, 3)).toBe(1);
    expect(clampPlayhead(1.6, 3)).toBe(2);
  });

  it("clamps a negative playhead to 0 and an over-end playhead to live", () => {
    const frames = buildTimelineFrames([
      ev("a", "session.created", "2026-06-11T00:00:00.000Z"),
      ev("b", "permission.requested", "2026-06-11T00:00:05.000Z"),
      ev("c", "coding_packet.created", "2026-06-11T00:00:12.000Z"),
    ]);
    const low = resolvePlayhead(frames, -5);
    expect(low.position).toBe(0);
    expect(low.isLive).toBe(false);
    expect(low.current?.id).toBe("a");
    const high = resolvePlayhead(frames, 99);
    expect(high.position).toBe(2);
    expect(high.isLive).toBe(true);
  });

  it("framesUpTo is empty-safe and returns all frames past the end", () => {
    const frames = buildTimelineFrames([
      ev("a", "session.created", "2026-06-11T00:00:00.000Z"),
      ev("b", "permission.requested", "2026-06-11T00:00:05.000Z"),
    ]);
    expect(framesUpTo([], 3)).toEqual([]);
    expect(framesUpTo(frames, 99).map((f) => f.id)).toEqual(["a", "b"]);
  });

  it("floors sub-seconds with no decimal and handles double-digit minutes", () => {
    expect(formatElapsed(500)).toBe("00:00");
    expect(formatElapsed(605000)).toBe("10:05");
  });
});
