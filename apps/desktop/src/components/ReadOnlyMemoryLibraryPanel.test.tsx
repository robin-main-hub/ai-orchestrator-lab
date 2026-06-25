import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { MemoryRecord } from "@ai-orchestrator/protocol";
import { ReadOnlyMemoryLibraryPanel } from "./ReadOnlyMemoryLibraryPanel";
import type { Stage6MemoryInspector } from "../runtime/stage6Memory";
import type { MemoryGovernanceSummary } from "../lib/memoryGovernance";

/**
 * The library.memory surface must be a read-only catalog: governance counts +
 * distributions + record metadata only — never a write/sync/eval/approve control,
 * and never a record body (which could carry sensitive text).
 */
const governance: MemoryGovernanceSummary = {
  activeCount: 3,
  controls: ["scope-isolation"],
  currentScopeLabel: "범위: project/demo",
  healthLabel: "메모리 양호",
  installLabel: "설치됨",
  pinnedCount: 1,
  quarantinedCount: 0,
  status: "ready",
  tombstonedCount: 0,
  totalRecords: 4,
};

// Minimal inspector — the panel reads only stats / counts / projection, so the
// trace / reflection / contextPacket / relations fields are intentionally omitted.
function inspector(over: Partial<Stage6MemoryInspector> = {}): Stage6MemoryInspector {
  return {
    stats: {
      totalRecords: 4,
      activeRecords: 3,
      pinnedRecords: 1,
      quarantinedRecords: 0,
      relationCount: 2,
      duplicateCandidates: 1,
      contradictionCandidates: 0,
      staleCandidates: 1,
      health: "good",
    },
    layerCounts: [{ layer: "episode", count: 2 }],
    scopeCounts: [{ scope: "project", count: 3 }],
    kindCounts: [{ kind: "decision", count: 1 }],
    trustCounts: { trusted: 3, limited: 1, untrusted: 0 },
    pinnedCount: 1,
    blockedCount: 0,
    eventProjection: { recentEventIds: [], pendingWrites: 0, conflictCount: 0 },
    ...over,
  } as unknown as Stage6MemoryInspector;
}

function record(over: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: "mem_1",
    layer: "episode",
    scope: "project",
    kind: "decision",
    title: "Adopt read-only shell surfaces",
    content: "SENSITIVE-BODY-SHOULD-NOT-RENDER",
    sourceChannel: "desktop",
    trustLevel: "trusted",
    activationState: "active",
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-24T00:00:00.000Z",
    pinned: true,
    tags: [],
    ...over,
  } as MemoryRecord;
}

describe("ReadOnlyMemoryLibraryPanel", () => {
  it("renders governance summary, distributions, and record metadata read-only", () => {
    const html = renderToStaticMarkup(
      <ReadOnlyMemoryLibraryPanel adapterStatus="ready" governanceSummary={governance} inspector={inspector()} records={[record()]} />,
    );
    expect(html).toContain("메모리 양호"); // governance health label
    expect(html).toContain("전체 4개"); // total record count
    expect(html).toContain("신뢰"); // trust distribution label
    expect(html).toContain("Adopt read-only shell surfaces"); // record title (metadata)
    expect(html).toContain("episode"); // layer metadata
  });

  it("never renders record body content (no body/secret leak)", () => {
    const html = renderToStaticMarkup(
      <ReadOnlyMemoryLibraryPanel adapterStatus="ready" governanceSummary={governance} inspector={inspector()} records={[record()]} />,
    );
    expect(html).not.toContain("SENSITIVE-BODY-SHOULD-NOT-RENDER");
  });

  it("has no mutation controls (read-only: no buttons, inputs, or forms)", () => {
    const html = renderToStaticMarkup(
      <ReadOnlyMemoryLibraryPanel adapterStatus="ready" governanceSummary={governance} inspector={inspector()} records={[record()]} />,
    );
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<form");
  });

  it("renders an honest empty state when there are no records", () => {
    const html = renderToStaticMarkup(
      <ReadOnlyMemoryLibraryPanel
        adapterStatus="ready"
        governanceSummary={{ ...governance, totalRecords: 0, activeCount: 0, pinnedCount: 0 }}
        inspector={inspector()}
        records={[]}
      />,
    );
    expect(html).toContain("메모리 기록이 없습니다");
  });
});
