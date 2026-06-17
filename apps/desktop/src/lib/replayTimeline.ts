/**
 * Batch 21 LINE E — pure REPLAY timeline projection.
 *
 * Groups already-projected (read-only) replay items into time clusters — runs of
 * events with no large gap between them — so REPLAY reads like an operation-theater
 * timeline instead of a flat list. Pure: no Date.now / I/O / mutation; operates
 * only on the input items' `createdAt` strings. Never writes EventStorage, never
 * calls a server. Read-only projection.
 */

export type ReplayTimelineItem = {
  id: string;
  title: string;
  category: string;
  source: string;
  createdAt: string;
};

export type ReplayTimelineCluster = {
  id: string;
  /** earliest createdAt in the cluster */
  startAt: string;
  /** latest createdAt in the cluster */
  endAt: string;
  count: number;
  /** category → count within the cluster */
  categories: Record<string, number>;
  /** items, newest first */
  items: ReplayTimelineItem[];
};

const DEFAULT_GAP_MS = 30 * 60 * 1000; // 30 min — a new cluster starts after a gap this large

function makeCluster(items: ReplayTimelineItem[]): ReplayTimelineCluster {
  // items arrive newest-first; endAt = newest, startAt = oldest.
  const endAt = items[0]!.createdAt;
  const startAt = items[items.length - 1]!.createdAt;
  const categories: Record<string, number> = {};
  for (const it of items) categories[it.category] = (categories[it.category] ?? 0) + 1;
  return { id: `cluster-${endAt}-${items.length}`, startAt, endAt, count: items.length, categories, items };
}

/**
 * Cluster replay items by time proximity (newest first). A gap larger than
 * `gapMs` between consecutive events starts a new cluster. Deterministic and
 * headless-testable — no Date.now.
 */
export function buildReplayTimeline(
  items: ReadonlyArray<ReplayTimelineItem> = [],
  opts: { gapMs?: number } = {},
): ReplayTimelineCluster[] {
  const gapMs = opts.gapMs ?? DEFAULT_GAP_MS;
  const sorted = [...items].sort(
    (a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0),
  );
  const clusters: ReplayTimelineCluster[] = [];
  let cur: ReplayTimelineItem[] = [];
  let prevT: number | null = null;
  for (const it of sorted) {
    const t = Date.parse(it.createdAt) || 0;
    if (prevT !== null && Math.abs(prevT - t) > gapMs && cur.length > 0) {
      clusters.push(makeCluster(cur));
      cur = [];
    }
    cur.push(it);
    prevT = t;
  }
  if (cur.length > 0) clusters.push(makeCluster(cur));
  return clusters;
}
