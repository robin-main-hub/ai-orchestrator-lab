import { Folder, ExternalLink, History, Play, Trash2 } from "lucide-react";
import type { ProjectRecord } from "../lib/projectRecord";
import { Card, CardContent, CardFooter, CardHeader } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

/**
 * H10 Project Persistence / Resume — UI slice (slice 3).
 *
 * Read-only Recent Projects surface that consumes records from
 * `useProjectRecordController` (slice 2). Selecting a card delegates
 * to `onSelectProject` — this component never auto-runs preview /
 * Visual QA / provider / patch apply (see handoff 2026-06-15).
 *
 * Display rules:
 *   - Title + goal are user-typed text; show as-is (truncated).
 *   - `lastPreviewUrl` only renders when truth === "observed" (the
 *     stored record already enforces this — helper clears the URL
 *     for any other truth value).
 *   - Visual QA / scaffold / publish render as compact badges.
 *   - Edit timeline summary shows only count + last source/status
 *     enum strings (no raw prompts / responses / file content).
 */

const SCAFFOLD_LABEL: Record<ProjectRecord["scaffold"], string> = {
  available: "scaffold ready",
  stale: "scaffold stale",
  missing: "scaffold missing",
  unknown: "scaffold unknown",
};

const VISUAL_QA_LABEL: Record<NonNullable<ProjectRecord["visualQa"]>["status"], string> = {
  passed: "QA passed",
  failed: "QA failed",
  blocked: "QA blocked",
  pending: "QA pending",
  unknown: "QA unknown",
};

const PREVIEW_TRUTH_LABEL: Record<NonNullable<ProjectRecord["lastPreviewTruth"]>, string> = {
  observed: "observed",
  stale: "stale",
  unobserved: "unobserved",
};

function scaffoldVariant(status: ProjectRecord["scaffold"]) {
  if (status === "available") return "secondary" as const;
  if (status === "missing") return "destructive" as const;
  return "outline" as const;
}

function visualQaVariant(status: NonNullable<ProjectRecord["visualQa"]>["status"]) {
  if (status === "passed") return "secondary" as const;
  if (status === "failed" || status === "blocked") return "destructive" as const;
  return "outline" as const;
}

export type RecentProjectsPanelProps = {
  records: ReadonlyArray<ProjectRecord>;
  /** Called when the user clicks the resume button on a project card. */
  onSelectProject: (missionId: string) => void;
  /**
   * Optional — when provided, a small trash button surfaces on each card.
   * When omitted, the remove control is hidden.
   */
  onRemoveProject?: (missionId: string) => void;
};

export function RecentProjectsPanel({ records, onSelectProject, onRemoveProject }: RecentProjectsPanelProps) {
  return (
    <Card className="recent-projects" data-testid="recent-projects-panel" data-count={records.length}>
      <CardHeader className="flex flex-row items-center gap-2 flex-wrap">
        <Folder size={14} />
        <span className="font-semibold">최근 프로젝트</span>
        <Badge variant="secondary">{records.length}개</Badge>
        <span className="text-muted-foreground text-xs">
          observed 상태만 표시 · 선택 시 자동 실행 없음
        </span>
      </CardHeader>
      <CardContent>
        {records.length === 0 ? (
          <p className="text-muted-foreground text-xs" data-testid="recent-projects-empty">
            아직 저장된 프로젝트가 없습니다
          </p>
        ) : (
          <ol className="space-y-2" data-testid="recent-projects-list">
            {records.map((record) => (
              <RecentProjectCard
                key={record.missionId}
                record={record}
                onSelectProject={onSelectProject}
                onRemoveProject={onRemoveProject}
              />
            ))}
          </ol>
        )}
      </CardContent>
      <CardFooter className="flex items-center gap-2 text-muted-foreground text-xs">
        <span>관전: preview / QA / provider 자동실행하지 않음</span>
      </CardFooter>
    </Card>
  );
}

function RecentProjectCard({
  record,
  onSelectProject,
  onRemoveProject,
}: {
  record: ProjectRecord;
  onSelectProject: (missionId: string) => void;
  onRemoveProject?: (missionId: string) => void;
}) {
  const previewObserved =
    record.lastPreviewTruth === "observed" && typeof record.lastPreviewUrl === "string";

  return (
    <li
      className="rounded-md border bg-muted/30 p-2 text-xs"
      data-testid={`recent-projects-item-${record.missionId}`}
      data-mission-id={record.missionId}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-sm truncate" title={record.title}>
            {record.title}
          </div>
          {record.goal ? (
            <p className="text-muted-foreground mt-0.5 truncate" title={record.goal}>
              {record.goal}
            </p>
          ) : null}
        </div>
        <time className="text-muted-foreground shrink-0" dateTime={record.updatedAt}>
          {record.updatedAt}
        </time>
      </div>

      <div className="mt-1 flex items-center gap-1 flex-wrap">
        <Badge variant={scaffoldVariant(record.scaffold)} data-testid={`recent-projects-scaffold-${record.missionId}`}>
          {SCAFFOLD_LABEL[record.scaffold]}
        </Badge>
        {record.visualQa ? (
          <Badge
            variant={visualQaVariant(record.visualQa.status)}
            data-testid={`recent-projects-qa-${record.missionId}`}
          >
            {VISUAL_QA_LABEL[record.visualQa.status]}
          </Badge>
        ) : null}
        {record.publish?.hasDraft ? (
          <Badge variant="outline" data-testid={`recent-projects-publish-${record.missionId}`}>
            {record.publish.prNumber ? `PR #${record.publish.prNumber}` : "publish draft"}
          </Badge>
        ) : null}
      </div>

      <div
        className="mt-1 flex items-center gap-2 flex-wrap text-muted-foreground"
        data-testid={`recent-projects-preview-${record.missionId}`}
      >
        <ExternalLink size={11} />
        {previewObserved ? (
          <code className="rounded bg-background/70 px-1 py-0.5" data-truth="observed">
            {record.lastPreviewUrl}
          </code>
        ) : (
          <span data-truth={record.lastPreviewTruth ?? "none"}>
            {record.lastPreviewTruth
              ? `preview ${PREVIEW_TRUTH_LABEL[record.lastPreviewTruth]}`
              : "no observed preview"}
          </span>
        )}
      </div>

      <div
        className="mt-1 flex items-center gap-2 flex-wrap text-muted-foreground"
        data-testid={`recent-projects-timeline-${record.missionId}`}
      >
        <History size={11} />
        <span>
          {record.editTimeline.totalEvents}개 edit
          {record.editTimeline.lastSource ? ` · last: ${record.editTimeline.lastSource}` : ""}
          {record.editTimeline.lastStatus ? ` / ${record.editTimeline.lastStatus}` : ""}
        </span>
        {record.editTimeline.hasRestorablePatch ? (
          <Badge variant="outline" data-testid={`recent-projects-restorable-${record.missionId}`}>
            restorable patch
          </Badge>
        ) : null}
      </div>

      <div className="mt-2 flex items-center justify-end gap-1">
        {onRemoveProject ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            data-testid={`recent-projects-remove-${record.missionId}`}
            onClick={() => onRemoveProject(record.missionId)}
            aria-label="프로젝트 삭제"
          >
            <Trash2 size={12} />
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="default"
          data-testid={`recent-projects-resume-${record.missionId}`}
          onClick={() => onSelectProject(record.missionId)}
        >
          <Play size={12} className="mr-1" />
          이어서
        </Button>
      </div>
    </li>
  );
}
