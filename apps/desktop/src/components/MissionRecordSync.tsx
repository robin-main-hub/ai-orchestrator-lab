import { useMemo } from "react";
import type { MissionBoardItem } from "../lib/missionBoardModel";
import type { PublishHistoryByStep } from "../lib/missionPublishPrefill";
import type {
  ProjectPublishStatus,
  ProjectScaffoldStatus,
  ProjectVisualQaStatus,
  ProjectVisualQaSummary,
} from "../lib/projectRecord";
import type { EditTimelineItem } from "../lib/editTimeline";
import type { ActivePreviewRef } from "../lib/activePreviewRef";
import {
  useProjectRecordSync,
  type ProjectRecordSyncInput,
} from "../hooks/useProjectRecordSync";
import type { ProjectRecordController } from "../hooks/useProjectRecordController";

/**
 * Per-mission projection of MissionBoardItem + ancillary state into the
 * ProjectRecord sync hook. Renders nothing — every effect lives inside
 * `useProjectRecordSync`.
 *
 * 정직성:
 *  - visualQa는 item.latestVisualQa가 있을 때만 매핑. 없으면 undefined를 흘려
 *    record의 unknown 기본값을 유지(가짜 passed 0).
 *  - scaffold는 getScaffoldFiles의 반환이 있을 때만 available/missing 판정.
 *    undefined면 "unknown" 그대로 흘림.
 *  - observedPreview는 ChatSidePanel iframe이 실제 observed로 lift된 ref가
 *    이 mission의 것일 때만 채움. 다른 미션 observed이면 undefined.
 *  - publish는 PR draft가 실제 존재(branch observed) 할 때만 ProjectPublishStatus
 *    object를 보낸다. 그 외엔 undefined → 기존 record 보존.
 *  - editTimelineItems는 호출자가 제공할 때만 흘림(보통 MissionWorkspaceDetail이
 *    펼쳐졌을 때만 의미 있는 데이터).
 */
export function MissionRecordSync({
  controller,
  item,
  activePreviewRef,
  publishHistory,
  scaffoldFileCount,
  editTimelineItems,
}: {
  controller: ProjectRecordController;
  item: MissionBoardItem;
  /** App.tsx가 들고 있는 가장 최근 observed preview ref. 다른 미션이면 무시. */
  activePreviewRef?: ActivePreviewRef | null;
  /** Container가 trace를 누적해 만든 단계별 publish history. 없으면 기존 record 보존. */
  publishHistory?: PublishHistoryByStep;
  /**
   * publishEnvironment.getScaffoldFiles(item)?.length 결과를 그대로 넘긴다.
   *  - undefined → scaffold "unknown"
   *  - 0          → "missing"
   *  - >0         → "available"
   * "stale"은 자동 추정 금지 — 별도 신호가 들어왔을 때만 채움.
   */
  scaffoldFileCount?: number;
  /** EditTimelineCard에 쓰이는 raw items. detail이 펼쳐졌을 때만 의미 있음. */
  editTimelineItems?: ReadonlyArray<EditTimelineItem>;
}) {
  const observedPreview = useMemo<ProjectRecordSyncInput["observedPreview"]>(() => {
    if (!activePreviewRef) return undefined;
    if (activePreviewRef.missionId !== item.missionId) return undefined;
    return {
      url: activePreviewRef.url,
      truth: "observed",
      observedAt: activePreviewRef.observedAt,
    };
  }, [activePreviewRef, item.missionId]);

  const visualQa = useMemo<ProjectVisualQaSummary | undefined>(() => {
    const raw = item.latestVisualQa;
    if (!raw) return undefined;
    return {
      status: mapVisualQaStatus(raw.status),
      summary: raw.issueCount > 0 ? `${raw.issueCount} issues` : undefined,
      checkedAt: item.updatedAt,
    };
  }, [item.latestVisualQa, item.updatedAt]);

  const scaffold = useMemo<ProjectScaffoldStatus | undefined>(() => {
    if (scaffoldFileCount === undefined) return undefined;
    return scaffoldFileCount > 0 ? "available" : "missing";
  }, [scaffoldFileCount]);

  const publish = useMemo<ProjectPublishStatus | undefined>(
    () => derivePublishStatus(publishHistory),
    [publishHistory],
  );

  useProjectRecordSync({
    controller,
    missionId: item.missionId,
    title: item.title,
    goal: item.goal,
    observedPreview,
    visualQa,
    scaffold,
    editTimelineItems,
    publish,
  });

  return null;
}

/**
 * MissionVisualQaSummary.status (4-way) → ProjectVisualQaStatus (5-way).
 * "warning" maps to "failed" because the QA finding needs user attention;
 * the summary string carries the "warning vs hard fail" nuance.
 */
function mapVisualQaStatus(status: "passed" | "warning" | "failed" | "blocked"): ProjectVisualQaStatus {
  switch (status) {
    case "passed":
      return "passed";
    case "warning":
    case "failed":
      return "failed";
    case "blocked":
      return "blocked";
    default:
      return "unknown";
  }
}

/**
 * PublishHistoryByStep → ProjectPublishStatus.
 *
 * 정직성: branch.observed 이전에는 draft 0. PR htmlUrl은 github.com/{owner}/{repo}/pull/{n}
 * 패턴일 때만 prNumber 추출.
 */
function derivePublishStatus(history: PublishHistoryByStep | undefined): ProjectPublishStatus | undefined {
  if (!history) return undefined;
  const branchObserved = history.branch?.status === "observed";
  const prEntry = history.pr;
  const prObserved = prEntry?.status === "observed";
  if (!branchObserved && !prObserved) return undefined;
  const timestamps = [history.branch?.ts, history.file?.ts, history.pr?.ts].filter(
    (ts): ts is string => typeof ts === "string" && ts.length > 0,
  );
  const lastUpdatedAt = timestamps.length > 0 ? timestamps.sort().slice(-1)[0] : undefined;
  const prUrl = prObserved && prEntry?.htmlUrl ? prEntry.htmlUrl : undefined;
  const prNumber = prUrl ? parsePullNumber(prUrl) : undefined;
  return {
    hasDraft: true,
    prNumber,
    prUrl,
    lastUpdatedAt,
  };
}

function parsePullNumber(url: string): number | undefined {
  const match = url.match(/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/);
  if (!match) return undefined;
  const n = Number.parseInt(match[1]!, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
