import { describe, expect, it } from "vitest";
import type { EventEnvelope } from "@ai-orchestrator/protocol";
import {
  buildTimelineFrames,
  clampPlayhead,
  cutInTone,
  formatElapsed,
  frameTicksByCategory,
  framesUpTo,
  isCutInEventType,
  recentFeedFrames,
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

describe("frameTicksByCategory", () => {
  const base = Date.parse("2026-06-11T00:00:00.000Z");
  const at = (sec: number) => new Date(base + sec * 1000).toISOString();

  it("빈 프레임 → []", () => {
    expect(frameTicksByCategory([], 8)).toEqual([]);
  });

  it("buckets <= 0 → []", () => {
    const frames = buildTimelineFrames([ev("a", "session.created", at(0))]);
    expect(frameTicksByCategory(frames, 0)).toEqual([]);
    expect(frameTicksByCategory(frames, -3)).toEqual([]);
  });

  it("단일 프레임 → 틱 1개, count 1", () => {
    const frames = buildTimelineFrames([ev("a", "session.created", at(0))]);
    const ticks = frameTicksByCategory(frames, 1);
    expect(ticks).toHaveLength(1);
    expect(ticks[0]!.bucket).toBe(0);
    expect(ticks[0]!.count).toBe(1);
    expect(ticks[0]!.dominant).toBe("session");
  });

  it("여러 프레임이 버킷에 분산 — count·dominant·경계 정확", () => {
    // span=4000ms, buckets=2, width=2000 → b0=[0,2000), b1=[2000,4000]
    const frames = buildTimelineFrames([
      ev("a", "session.created", at(0)), //     e0    → b0
      ev("b", "message.posted", at(1)), //      e1000 → b0
      ev("c", "tmux.capture.recorded", at(2)), // e2000 → b1
      ev("d", "permission.requested", at(3)), //  e3000 → b1
      ev("e", "permission.approved", at(4)), //   e4000 → b1 (마지막 프레임 → 마지막 버킷)
    ]);
    const ticks = frameTicksByCategory(frames, 2);
    expect(ticks).toHaveLength(2);
    expect(ticks[0]!.count).toBe(2);
    expect(ticks[1]!.count).toBe(3);
    // b0: session·message 각 1 → 동률 → 가장 이른 = session
    expect(ticks[0]!.dominant).toBe("session");
    // b1: tmux 1, permission 2 → 최빈 permission
    expect(ticks[1]!.dominant).toBe("permission");
    expect(ticks[0]!.startMs).toBe(0);
    expect(ticks[0]!.endMs).toBe(2000);
    expect(ticks[1]!.startMs).toBe(2000);
    expect(ticks[1]!.endMs).toBe(4000);
  });

  it("동률은 버킷 안 가장 이른 프레임의 카테고리로", () => {
    // 한 버킷에 message·permission 각 1 → 이른 것 = message
    const frames = buildTimelineFrames([
      ev("a", "message.posted", at(0)),
      ev("b", "permission.requested", at(1)),
    ]);
    const ticks = frameTicksByCategory(frames, 1);
    expect(ticks).toHaveLength(1);
    expect(ticks[0]!.count).toBe(2);
    expect(ticks[0]!.dominant).toBe("message");
  });

  it("빈 버킷 → count 0 · dominant system", () => {
    // 2 프레임(0s, 3s), 4 버킷: b0=1, b1·b2 빈, b3=1(마지막 프레임)
    const frames = buildTimelineFrames([
      ev("a", "coding_packet.created", at(0)),
      ev("b", "memory.curated", at(3)),
    ]);
    const ticks = frameTicksByCategory(frames, 4);
    expect(ticks).toHaveLength(4);
    expect(ticks[0]!.count).toBe(1);
    expect(ticks[0]!.dominant).toBe("coding");
    expect(ticks[1]!.count).toBe(0);
    expect(ticks[1]!.dominant).toBe("system");
    expect(ticks[2]!.count).toBe(0);
    expect(ticks[2]!.dominant).toBe("system");
    expect(ticks[3]!.count).toBe(1);
    expect(ticks[3]!.dominant).toBe("memory");
  });

  it("스팬 0(전 프레임 동일 시각) → 전부 버킷 0, 나머지 빈", () => {
    const frames = buildTimelineFrames([
      ev("x", "autonomy.run.step", at(0)),
      ev("y", "autonomy.run.step", at(0)),
      ev("z", "autonomy.run.step", at(0)),
    ]);
    const ticks = frameTicksByCategory(frames, 3);
    expect(ticks).toHaveLength(3);
    expect(ticks[0]!.count).toBe(3);
    expect(ticks[0]!.dominant).toBe("run");
    expect(ticks[1]!.count).toBe(0);
    expect(ticks[2]!.count).toBe(0);
    // 스팬 0 → 경계는 전부 first(=0)
    expect(ticks[0]!.startMs).toBe(0);
    expect(ticks[0]!.endMs).toBe(0);
  });
});

describe("recentFeedFrames", () => {
  const frames = buildTimelineFrames([
    ev("a", "session.created", "2026-06-11T00:00:00.000Z"),
    ev("b", "message.posted", "2026-06-11T00:00:05.000Z"),
    ev("c", "permission.requested", "2026-06-11T00:00:12.000Z"),
    ev("d", "permission.approved", "2026-06-11T00:00:18.000Z"),
  ]);

  it("라이브면 전체의 끝 N개", () => {
    expect(recentFeedFrames(frames, { position: 3, isLive: true }, 2).map((f) => f.id)).toEqual(["c", "d"]);
  });
  it("되감기면 position까지 잘라 끝 N개(리플레이 재현)", () => {
    expect(recentFeedFrames(frames, { position: 1, isLive: false }, 8).map((f) => f.id)).toEqual(["a", "b"]);
    expect(recentFeedFrames(frames, { position: 2, isLive: false }, 2).map((f) => f.id)).toEqual(["b", "c"]);
  });
  it("count<=0 또는 빈 프레임 → []", () => {
    expect(recentFeedFrames(frames, { position: 3, isLive: true }, 0)).toEqual([]);
    expect(recentFeedFrames([], { position: -1, isLive: true }, 8)).toEqual([]);
  });
});

describe("isCutInEventType / cutInTone", () => {
  it("승인·실패·위임 배정만 컷인 트리거", () => {
    expect(isCutInEventType("permission.requested")).toBe(true);
    expect(isCutInEventType("permission.approved")).toBe(true);
    expect(isCutInEventType("permission.rejected")).toBe(true);
    expect(isCutInEventType("autonomy.run.failed")).toBe(true);
    expect(isCutInEventType("makima.delegation.assignment.created")).toBe(true);
    expect(isCutInEventType("makima.delegation.assignment.progressed")).toBe(true);
    expect(isCutInEventType("session.created")).toBe(false);
    expect(isCutInEventType("message.posted")).toBe(false);
  });
  it("톤: 승인요청=warning / 실패·거부=destructive / 그 외=accent", () => {
    expect(cutInTone("permission.requested")).toBe("warning");
    expect(cutInTone("permission.rejected")).toBe("destructive");
    expect(cutInTone("autonomy.run.failed")).toBe("destructive");
    expect(cutInTone("permission.approved")).toBe("accent");
    expect(cutInTone("makima.delegation.assignment.created")).toBe("accent");
  });
});
