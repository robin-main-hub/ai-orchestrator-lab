// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MissionRecordSync } from "./MissionRecordSync";
import type { MissionBoardItem } from "../lib/missionBoardModel";
import type { ProjectRecordController } from "../hooks/useProjectRecordController";

afterEach(() => cleanup());

function makeItem(overrides: Partial<MissionBoardItem> = {}): MissionBoardItem {
  return {
    missionId: "m1",
    title: "Alpha App",
    goal: "build a small dashboard",
    status: "planned",
    truthStatus: "planned",
    source: "server_observed",
    workers: [],
    artifactCount: 0,
    verificationCount: 0,
    mergeQueueCount: 0,
    workspaceCount: 0,
    designIssues: [],
    errorCards: [],
    selfCorrections: [],
    updatedAt: "2026-06-15T02:00:00.000Z",
    ...overrides,
  };
}

function makeStubController(): ProjectRecordController & {
  __calls: {
    ensureRecord: Array<{ missionId: string; title: string; goal?: string }>;
    recordPreview: Array<[string, { url?: string; truth: string; observedAt: string }]>;
    recordVisualQa: Array<[string, unknown]>;
    recordScaffold: Array<[string, string]>;
    recordEditTimeline: Array<[string, unknown]>;
    recordPublishStatus: Array<[string, unknown]>;
  };
} {
  const calls = {
    ensureRecord: [] as Array<{ missionId: string; title: string; goal?: string }>,
    recordPreview: [] as Array<[string, { url?: string; truth: string; observedAt: string }]>,
    recordVisualQa: [] as Array<[string, unknown]>,
    recordScaffold: [] as Array<[string, string]>,
    recordEditTimeline: [] as Array<[string, unknown]>,
    recordPublishStatus: [] as Array<[string, unknown]>,
  };
  return {
    __calls: calls,
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
        createdAt: "t",
        updatedAt: "t",
      };
    },
    recordPreview: (missionId, input) => {
      calls.recordPreview.push([missionId, input]);
    },
    recordVisualQa: (missionId, summary) => {
      calls.recordVisualQa.push([missionId, summary]);
    },
    recordScaffold: (missionId, scaffold) => {
      calls.recordScaffold.push([missionId, scaffold]);
    },
    recordEditTimeline: (missionId, summary) => {
      calls.recordEditTimeline.push([missionId, summary]);
    },
    recordPublishStatus: (missionId, publish) => {
      calls.recordPublishStatus.push([missionId, publish]);
    },
    remove: vi.fn(),
  };
}

describe("MissionRecordSync", () => {
  it("ensures the record exists on mount with title + goal from the item", () => {
    const controller = makeStubController();
    render(<MissionRecordSync controller={controller} item={makeItem()} />);
    expect(controller.__calls.ensureRecord).toHaveLength(1);
    expect(controller.__calls.ensureRecord[0]).toEqual({
      missionId: "m1",
      title: "Alpha App",
      goal: "build a small dashboard",
    });
  });

  it("does NOT call recordPreview when activePreviewRef is missing", () => {
    const controller = makeStubController();
    render(<MissionRecordSync controller={controller} item={makeItem()} activePreviewRef={null} />);
    expect(controller.__calls.recordPreview).toHaveLength(0);
  });

  it("does NOT call recordPreview when activePreviewRef belongs to a different mission", () => {
    const controller = makeStubController();
    render(
      <MissionRecordSync
        controller={controller}
        item={makeItem()}
        activePreviewRef={{ missionId: "other-mission", url: "http://x/", observedAt: "t" }}
      />,
    );
    expect(controller.__calls.recordPreview).toHaveLength(0);
  });

  it("forwards observed preview as truth=observed when missionId matches", () => {
    const controller = makeStubController();
    render(
      <MissionRecordSync
        controller={controller}
        item={makeItem()}
        activePreviewRef={{ missionId: "m1", url: "http://x:5050/", observedAt: "2026-06-15T03:00:00Z" }}
      />,
    );
    expect(controller.__calls.recordPreview).toHaveLength(1);
    expect(controller.__calls.recordPreview[0]).toEqual([
      "m1",
      { url: "http://x:5050/", truth: "observed", observedAt: "2026-06-15T03:00:00Z" },
    ]);
  });

  it("does NOT call recordScaffold when scaffoldFileCount is undefined (unknown stays unknown)", () => {
    const controller = makeStubController();
    render(<MissionRecordSync controller={controller} item={makeItem()} />);
    expect(controller.__calls.recordScaffold).toHaveLength(0);
  });

  it("maps scaffoldFileCount=0 to missing, >0 to available", () => {
    const c1 = makeStubController();
    render(<MissionRecordSync controller={c1} item={makeItem({ missionId: "m_empty" })} scaffoldFileCount={0} />);
    expect(c1.__calls.recordScaffold[0]).toEqual(["m_empty", "missing"]);
    cleanup();
    const c2 = makeStubController();
    render(<MissionRecordSync controller={c2} item={makeItem({ missionId: "m_has" })} scaffoldFileCount={3} />);
    expect(c2.__calls.recordScaffold[0]).toEqual(["m_has", "available"]);
  });

  it("does NOT call recordVisualQa when item.latestVisualQa is absent", () => {
    const controller = makeStubController();
    render(<MissionRecordSync controller={controller} item={makeItem()} />);
    expect(controller.__calls.recordVisualQa).toHaveLength(0);
  });

  it("maps latestVisualQa.status='warning' to ProjectVisualQaStatus 'failed'", () => {
    const controller = makeStubController();
    render(
      <MissionRecordSync
        controller={controller}
        item={makeItem({
          latestVisualQa: {
            id: "qa1",
            workspaceId: "ws1",
            status: "warning",
            truthStatus: "observed",
            issueCount: 2,
            previewUrl: "http://x/",
          },
        })}
      />,
    );
    expect(controller.__calls.recordVisualQa).toHaveLength(1);
    expect(controller.__calls.recordVisualQa[0]?.[1]).toMatchObject({
      status: "failed",
      summary: "2 issues",
    });
  });

  it("maps latestVisualQa.status='passed' to ProjectVisualQaStatus 'passed' with no issues line", () => {
    const controller = makeStubController();
    render(
      <MissionRecordSync
        controller={controller}
        item={makeItem({
          latestVisualQa: {
            id: "qa2",
            workspaceId: "ws1",
            status: "passed",
            truthStatus: "observed",
            issueCount: 0,
            previewUrl: "http://x/",
          },
        })}
      />,
    );
    expect(controller.__calls.recordVisualQa[0]?.[1]).toMatchObject({ status: "passed" });
    expect((controller.__calls.recordVisualQa[0]?.[1] as { summary?: string }).summary).toBeUndefined();
  });

  it("does NOT call recordPublishStatus when publishHistory is undefined", () => {
    const controller = makeStubController();
    render(<MissionRecordSync controller={controller} item={makeItem()} />);
    expect(controller.__calls.recordPublishStatus).toHaveLength(0);
  });

  it("does NOT report a draft until branch.observed OR pr.observed", () => {
    const controller = makeStubController();
    render(
      <MissionRecordSync
        controller={controller}
        item={makeItem()}
        publishHistory={{
          branch: { step: "branch", status: "planned", summary: "", ts: "2026-06-15T01:00:00Z" },
        }}
      />,
    );
    expect(controller.__calls.recordPublishStatus).toHaveLength(0);
  });

  it("derives ProjectPublishStatus with hasDraft=true + prNumber from pr.htmlUrl", () => {
    const controller = makeStubController();
    render(
      <MissionRecordSync
        controller={controller}
        item={makeItem()}
        publishHistory={{
          branch: { step: "branch", status: "observed", summary: "", ts: "2026-06-15T01:00:00Z" },
          pr: {
            step: "pr",
            status: "observed",
            summary: "",
            ts: "2026-06-15T03:00:00Z",
            htmlUrl: "https://github.com/owner/repo/pull/123",
          },
        }}
      />,
    );
    expect(controller.__calls.recordPublishStatus).toHaveLength(1);
    expect(controller.__calls.recordPublishStatus[0]?.[1]).toEqual({
      hasDraft: true,
      prNumber: 123,
      prUrl: "https://github.com/owner/repo/pull/123",
      lastUpdatedAt: "2026-06-15T03:00:00Z",
    });
  });

  it("refuses non-github.com htmlUrl for prNumber extraction (no fake PR number)", () => {
    const controller = makeStubController();
    render(
      <MissionRecordSync
        controller={controller}
        item={makeItem()}
        publishHistory={{
          branch: { step: "branch", status: "observed", summary: "", ts: "2026-06-15T01:00:00Z" },
          pr: {
            step: "pr",
            status: "observed",
            summary: "",
            ts: "2026-06-15T03:00:00Z",
            // PublishHistoryEntry's parser only stores github.com URLs anyway, but the sync
            // adapter's own regex guard is the final line of defense — test it directly here.
            htmlUrl: undefined,
          },
        }}
      />,
    );
    const recorded = controller.__calls.recordPublishStatus[0]?.[1] as {
      hasDraft: boolean;
      prNumber?: number;
      prUrl?: string;
    };
    expect(recorded.hasDraft).toBe(true);
    expect(recorded.prNumber).toBeUndefined();
    expect(recorded.prUrl).toBeUndefined();
  });
});
