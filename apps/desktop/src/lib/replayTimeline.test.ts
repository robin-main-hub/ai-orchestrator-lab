import { describe, expect, it } from "vitest";
import { buildReplayTimeline, type ReplayTimelineItem } from "./replayTimeline";

const item = (over: Partial<ReplayTimelineItem> = {}): ReplayTimelineItem => ({
  id: "e1",
  title: "event",
  category: "system",
  source: "eventLog",
  createdAt: "2026-06-18T10:00:00.000Z",
  ...over,
});

describe("Batch 21 — buildReplayTimeline (pure)", () => {
  it("groups near-in-time events into one cluster (newest first)", () => {
    const clusters = buildReplayTimeline([
      item({ id: "a", createdAt: "2026-06-18T10:00:00.000Z", category: "runner" }),
      item({ id: "b", createdAt: "2026-06-18T10:05:00.000Z", category: "failure" }),
      item({ id: "c", createdAt: "2026-06-18T10:10:00.000Z", category: "runner" }),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.count).toBe(3);
    expect(clusters[0]!.endAt).toBe("2026-06-18T10:10:00.000Z"); // newest
    expect(clusters[0]!.startAt).toBe("2026-06-18T10:00:00.000Z"); // oldest
    expect(clusters[0]!.categories).toEqual({ runner: 2, failure: 1 });
    // newest-first ordering inside the cluster
    expect(clusters[0]!.items[0]!.id).toBe("c");
  });

  it("splits into separate clusters when the gap exceeds the threshold", () => {
    const clusters = buildReplayTimeline([
      item({ id: "old", createdAt: "2026-06-18T08:00:00.000Z" }),
      item({ id: "new1", createdAt: "2026-06-18T10:00:00.000Z" }),
      item({ id: "new2", createdAt: "2026-06-18T10:02:00.000Z" }),
    ]);
    // 2h gap between 08:00 and 10:00 → two clusters (newest cluster first)
    expect(clusters).toHaveLength(2);
    expect(clusters[0]!.count).toBe(2); // the 10:00 cluster
    expect(clusters[1]!.count).toBe(1); // the 08:00 cluster
  });

  it("honors a custom gapMs", () => {
    const clusters = buildReplayTimeline(
      [
        item({ id: "a", createdAt: "2026-06-18T10:00:00.000Z" }),
        item({ id: "b", createdAt: "2026-06-18T10:02:00.000Z" }),
      ],
      { gapMs: 60 * 1000 }, // 1 min → the 2-min gap splits them
    );
    expect(clusters).toHaveLength(2);
  });

  it("is empty-safe and deterministic", () => {
    expect(buildReplayTimeline([])).toEqual([]);
    const a = JSON.stringify(buildReplayTimeline([item()]));
    const b = JSON.stringify(buildReplayTimeline([item()]));
    expect(a).toBe(b);
  });
});
