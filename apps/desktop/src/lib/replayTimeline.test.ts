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

// Characterization tests for the previously-uncovered gap-boundary, bad-input,
// id-format and internal-sort branches (no behavior change). The existing suite
// covers basic clustering, a gap-split, a custom gapMs and empty-safety; these
// pin the strict `>` gap boundary (an exactly-threshold gap stays in one
// cluster), the unparseable-createdAt → epoch-0 sort-to-oldest split, the
// `cluster-<endAt>-<count>` id format with startAt===endAt for a lone item, the
// shuffled-input newest-first internal sort, and per-cluster category tallies
// that stay independent across a split. All pure, no Date.now.
describe("replayTimeline — gap-boundary, bad-input, id & sort characterization", () => {
  it("keeps an exactly-threshold gap in one cluster but splits a just-larger gap (strict >)", () => {
    expect(
      buildReplayTimeline([
        item({ id: "a", createdAt: "2026-06-18T10:00:00.000Z" }),
        item({ id: "b", createdAt: "2026-06-18T10:30:00.000Z" }), // exactly 30 min
      ]),
    ).toHaveLength(1);
    expect(
      buildReplayTimeline([
        item({ id: "a", createdAt: "2026-06-18T10:00:00.000Z" }),
        item({ id: "b", createdAt: "2026-06-18T10:30:00.001Z" }), // 1 ms over
      ]),
    ).toHaveLength(2);
  });

  it("treats an unparseable createdAt as epoch 0, sorting it oldest and splitting it off", () => {
    const clusters = buildReplayTimeline([
      item({ id: "good", createdAt: "2026-06-18T10:00:00.000Z" }),
      item({ id: "bad", createdAt: "not-a-date" }),
    ]);
    expect(clusters).toHaveLength(2);
    expect(clusters[0]!.items[0]!.id).toBe("good");
    expect(clusters[1]!.items[0]!.id).toBe("bad");
    expect(clusters[1]!.startAt).toBe("not-a-date");
    expect(clusters[1]!.endAt).toBe("not-a-date");
    expect(clusters[1]!.id).toBe("cluster-not-a-date-1");
  });

  it("derives the cluster id from endAt and count, with startAt===endAt for a lone item", () => {
    const [cluster] = buildReplayTimeline([
      item({ id: "solo", createdAt: "2026-06-18T10:00:00.000Z", category: "memory" }),
    ]);
    expect(cluster!.id).toBe("cluster-2026-06-18T10:00:00.000Z-1");
    expect(cluster!.startAt).toBe("2026-06-18T10:00:00.000Z");
    expect(cluster!.endAt).toBe("2026-06-18T10:00:00.000Z");
    expect(cluster!.categories).toEqual({ memory: 1 });
  });

  it("sorts shuffled input newest-first inside a single cluster", () => {
    const [cluster] = buildReplayTimeline([
      item({ id: "b", createdAt: "2026-06-18T10:05:00.000Z" }),
      item({ id: "c", createdAt: "2026-06-18T10:10:00.000Z" }),
      item({ id: "a", createdAt: "2026-06-18T10:00:00.000Z" }),
    ]);
    expect(cluster!.items.map((it) => it.id)).toEqual(["c", "b", "a"]);
    expect(cluster!.endAt).toBe("2026-06-18T10:10:00.000Z");
    expect(cluster!.startAt).toBe("2026-06-18T10:00:00.000Z");
  });

  it("tallies categories independently per cluster across a gap split", () => {
    const clusters = buildReplayTimeline([
      item({ id: "r1", createdAt: "2026-06-18T10:10:00.000Z", category: "runner" }),
      item({ id: "r2", createdAt: "2026-06-18T10:05:00.000Z", category: "failure" }),
      item({ id: "o1", createdAt: "2026-06-18T08:00:00.000Z", category: "memory" }),
    ]);
    expect(clusters).toHaveLength(2);
    expect(clusters[0]!.categories).toEqual({ runner: 1, failure: 1 });
    expect(clusters[1]!.categories).toEqual({ memory: 1 });
  });
});
