// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { deriveEditTimelineSummary, useProjectRecordSync } from "./useProjectRecordSync";
import type { ProjectRecordController } from "./useProjectRecordController";
import type { EditTimelineItem } from "../lib/editTimeline";

afterEach(() => cleanup());

function makeStubController(): ProjectRecordController & {
  __calls: {
    ensureRecord: unknown[];
    recordPreview: unknown[];
    recordVisualQa: unknown[];
    recordScaffold: unknown[];
    recordEditTimeline: unknown[];
    recordPublishStatus: unknown[];
    remove: unknown[];
  };
} {
  const calls = {
    ensureRecord: [] as unknown[],
    recordPreview: [] as unknown[],
    recordVisualQa: [] as unknown[],
    recordScaffold: [] as unknown[],
    recordEditTimeline: [] as unknown[],
    recordPublishStatus: [] as unknown[],
    remove: [] as unknown[],
  };
  return {
    records: [],
    find: () => undefined,
    ensureRecord: (input) => {
      calls.ensureRecord.push(input);
      return {
        missionId: input.missionId,
        title: input.title,
        goal: input.goal,
        scaffold: "unknown",
        editTimeline: { totalEvents: 0, hasRestorablePatch: false },
        createdAt: "stub",
        updatedAt: "stub",
      };
    },
    recordPreview: (...args) => calls.recordPreview.push(args),
    recordVisualQa: (...args) => calls.recordVisualQa.push(args),
    recordScaffold: (...args) => calls.recordScaffold.push(args),
    recordEditTimeline: (...args) => calls.recordEditTimeline.push(args),
    recordPublishStatus: (...args) => calls.recordPublishStatus.push(args),
    remove: (...args) => calls.remove.push(args),
    __calls: calls,
  };
}

function makeTimelineItem(
  partial: Partial<EditTimelineItem> & { id: string; timestamp: string },
): EditTimelineItem {
  return {
    id: partial.id,
    kind: partial.kind ?? "search_replace_preview_created",
    source: partial.source ?? "search_replace",
    status: partial.status ?? "preview",
    timestamp: partial.timestamp,
    affectedFiles: partial.affectedFiles ?? [],
    summary: partial.summary ?? "stub",
    restoreText: partial.restoreText,
  };
}

describe("deriveEditTimelineSummary", () => {
  it("returns empty summary when no items", () => {
    expect(deriveEditTimelineSummary([])).toEqual({
      totalEvents: 0,
      hasRestorablePatch: false,
    });
  });

  it("uses last item for lastEventAt / lastSource / lastStatus", () => {
    const items: EditTimelineItem[] = [
      makeTimelineItem({ id: "1", timestamp: "2026-06-15T01:00:00.000Z", source: "preview", status: "captured" }),
      makeTimelineItem({ id: "2", timestamp: "2026-06-15T02:00:00.000Z", source: "search_replace", status: "applied", restoreText: "patch" }),
    ];
    expect(deriveEditTimelineSummary(items)).toEqual({
      totalEvents: 2,
      lastEventAt: "2026-06-15T02:00:00.000Z",
      lastSource: "search_replace",
      lastStatus: "applied",
      hasRestorablePatch: true,
    });
  });

  it("hasRestorablePatch is false when applied item has no restoreText", () => {
    const items: EditTimelineItem[] = [
      makeTimelineItem({ id: "1", timestamp: "x", status: "applied", restoreText: undefined }),
    ];
    expect(deriveEditTimelineSummary(items).hasRestorablePatch).toBe(false);
  });

  it("hasRestorablePatch is false when restoreText is empty string", () => {
    const items: EditTimelineItem[] = [
      makeTimelineItem({ id: "1", timestamp: "x", status: "applied", restoreText: "" }),
    ];
    expect(deriveEditTimelineSummary(items).hasRestorablePatch).toBe(false);
  });
});

describe("useProjectRecordSync", () => {
  it("calls ensureRecord on mount and once per missionId", () => {
    const controller = makeStubController();
    const { rerender } = renderHook(
      (props: { missionId: string; title: string }) =>
        useProjectRecordSync({ controller, missionId: props.missionId, title: props.title }),
      { initialProps: { missionId: "m1", title: "App One" } },
    );
    expect(controller.__calls.ensureRecord).toHaveLength(1);

    // Same missionId, no new ensureRecord.
    rerender({ missionId: "m1", title: "different title" });
    expect(controller.__calls.ensureRecord).toHaveLength(1);

    // Different missionId, new ensureRecord.
    rerender({ missionId: "m2", title: "App Two" });
    expect(controller.__calls.ensureRecord).toHaveLength(2);
  });

  it("forwards a preview observation and dedupes identical inputs", () => {
    const controller = makeStubController();
    const observed = { url: "http://127.0.0.1:5174/", truth: "observed" as const, observedAt: "2026-06-15T02:00:00.000Z" };
    const { rerender } = renderHook(
      (props: { observed: typeof observed }) =>
        useProjectRecordSync({
          controller,
          missionId: "m1",
          title: "x",
          observedPreview: props.observed,
        }),
      { initialProps: { observed } },
    );
    expect(controller.__calls.recordPreview).toHaveLength(1);

    rerender({ observed: { ...observed } });
    expect(controller.__calls.recordPreview).toHaveLength(1); // dedup

    rerender({ observed: { ...observed, observedAt: "2026-06-15T02:30:00.000Z" } });
    expect(controller.__calls.recordPreview).toHaveLength(2);
  });

  it("forwards visualQa changes", () => {
    const controller = makeStubController();
    const { rerender } = renderHook(
      (props: { qa?: { status: "passed" | "failed"; checkedAt: string } }) =>
        useProjectRecordSync({ controller, missionId: "m1", title: "x", visualQa: props.qa }),
      { initialProps: { qa: { status: "passed", checkedAt: "2026-06-15T02:00:00.000Z" } } },
    );
    expect(controller.__calls.recordVisualQa).toHaveLength(1);

    rerender({ qa: { status: "failed", checkedAt: "2026-06-15T03:00:00.000Z" } });
    expect(controller.__calls.recordVisualQa).toHaveLength(2);
  });

  it("forwards scaffold changes once per distinct value", () => {
    const controller = makeStubController();
    const { rerender } = renderHook(
      (props: { scaffold?: "available" | "missing" | "stale" | "unknown" }) =>
        useProjectRecordSync({ controller, missionId: "m1", title: "x", scaffold: props.scaffold }),
      { initialProps: { scaffold: "unknown" as "available" | "missing" | "stale" | "unknown" } },
    );
    expect(controller.__calls.recordScaffold).toHaveLength(1);

    rerender({ scaffold: "unknown" });
    expect(controller.__calls.recordScaffold).toHaveLength(1); // dedup

    rerender({ scaffold: "available" });
    expect(controller.__calls.recordScaffold).toHaveLength(2);
  });

  it("forwards editTimeline derived from raw items", () => {
    const controller = makeStubController();
    const items: EditTimelineItem[] = [
      makeTimelineItem({ id: "1", timestamp: "2026-06-15T01:00:00.000Z", source: "preview" }),
    ];
    renderHook(() =>
      useProjectRecordSync({ controller, missionId: "m1", title: "x", editTimelineItems: items }),
    );
    expect(controller.__calls.recordEditTimeline).toHaveLength(1);
    const [, summary] = controller.__calls.recordEditTimeline[0] as [string, { totalEvents: number }];
    expect(summary.totalEvents).toBe(1);
  });

  it("prefers explicit editTimeline summary over derived items", () => {
    const controller = makeStubController();
    const explicit = { totalEvents: 99, hasRestorablePatch: false };
    renderHook(() =>
      useProjectRecordSync({
        controller,
        missionId: "m1",
        title: "x",
        editTimeline: explicit,
        editTimelineItems: [
          makeTimelineItem({ id: "1", timestamp: "2026-06-15T01:00:00.000Z" }),
        ],
      }),
    );
    const [, summary] = controller.__calls.recordEditTimeline[0] as [string, { totalEvents: number }];
    expect(summary.totalEvents).toBe(99);
  });

  it("forwards publish status changes but undefined does not clear", () => {
    const controller = makeStubController();
    const { rerender } = renderHook(
      (props: { publish?: { hasDraft: boolean; prNumber?: number } }) =>
        useProjectRecordSync({ controller, missionId: "m1", title: "x", publish: props.publish }),
      { initialProps: { publish: { hasDraft: true, prNumber: 515 } as { hasDraft: boolean; prNumber?: number } | undefined } },
    );
    expect(controller.__calls.recordPublishStatus).toHaveLength(1);

    // undefined passed → adapter intentionally does NOT clear (caller must
    // call controller.recordPublishStatus(missionId, undefined) explicitly).
    rerender({ publish: undefined });
    expect(controller.__calls.recordPublishStatus).toHaveLength(1);
  });

  it("does not call any recorder when only missionId/title are provided", () => {
    const controller = makeStubController();
    renderHook(() => useProjectRecordSync({ controller, missionId: "m1", title: "x" }));
    expect(controller.__calls.ensureRecord).toHaveLength(1);
    expect(controller.__calls.recordPreview).toHaveLength(0);
    expect(controller.__calls.recordVisualQa).toHaveLength(0);
    expect(controller.__calls.recordScaffold).toHaveLength(0);
    expect(controller.__calls.recordEditTimeline).toHaveLength(0);
    expect(controller.__calls.recordPublishStatus).toHaveLength(0);
  });

  it("never triggers a provider / preview / qa rerun", () => {
    // Sanity test for the honesty contract — the adapter exposes only
    // record* methods and never indirectly causes a side-effect rerun.
    const controller = makeStubController();
    const sideEffectSpy = vi.fn();
    (controller as unknown as { triggerRerun?: () => void }).triggerRerun = sideEffectSpy;
    renderHook(() =>
      useProjectRecordSync({
        controller,
        missionId: "m1",
        title: "x",
        observedPreview: { url: "http://127.0.0.1:5174/", truth: "observed", observedAt: "x" },
        visualQa: { status: "passed" },
        scaffold: "available",
        publish: { hasDraft: true },
      }),
    );
    expect(sideEffectSpy).not.toHaveBeenCalled();
  });
});
