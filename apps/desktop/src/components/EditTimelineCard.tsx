import { History, RotateCcw } from "lucide-react";
import type { EditTimelineItem } from "../lib/editTimeline";
import { Card, CardContent, CardFooter, CardHeader } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

const SOURCE_LABEL: Record<EditTimelineItem["source"], string> = {
  preview: "preview",
  turbo_edits: "turbo edits",
  search_replace: "search/replace",
  scaffold_overlay: "overlay",
  visual_qa: "visual QA",
  fix_verification: "verification",
};

const STATUS_LABEL: Record<EditTimelineItem["status"], string> = {
  captured: "captured",
  requested: "requested",
  preview: "preview",
  generated: "generated",
  invalid: "invalid",
  failed: "failed",
  no_confident_edits: "no edits",
  applied: "applied",
  observed: "observed",
};

export function EditTimelineCard({
  missionId,
  items,
  onRestorePatch,
}: {
  missionId: string;
  items: ReadonlyArray<EditTimelineItem>;
  onRestorePatch: (text: string) => void;
}) {
  const lastRestorable = [...items].reverse().find((item) => item.status === "applied" && item.restoreText);
  return (
    <Card
      className="edit-timeline"
      data-testid={`edit-timeline-${missionId}`}
      data-count={items.length}
    >
      <CardHeader className="flex flex-row items-center gap-2 flex-wrap">
        <History size={14} />
        <span className="font-semibold">수정 히스토리</span>
        <Badge variant="secondary">{items.length}개</Badge>
        <span className="text-muted-foreground text-xs">
          source/status/time/files/summary만 표시
        </span>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p
            className="text-muted-foreground text-xs"
            data-testid={`edit-timeline-empty-${missionId}`}
          >
            아직 수정 이벤트 없음
          </p>
        ) : (
          <ol className="space-y-2" data-testid={`edit-timeline-list-${missionId}`}>
            {items.map((item) => (
              <li
                key={item.id}
                className="rounded-md border bg-muted/30 p-2 text-xs"
                data-testid={`edit-timeline-item-${missionId}-${item.id}`}
                data-kind={item.kind}
                data-status={item.status}
              >
                <div className="flex items-center gap-1 flex-wrap">
                  <Badge variant="outline">{SOURCE_LABEL[item.source]}</Badge>
                  <Badge variant={item.status === "failed" || item.status === "invalid" ? "destructive" : "secondary"}>
                    {STATUS_LABEL[item.status]}
                  </Badge>
                  <time className="text-muted-foreground" dateTime={item.timestamp}>
                    {item.timestamp}
                  </time>
                </div>
                <p className="mt-1">{item.summary}</p>
                {item.affectedFiles.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1" data-testid={`edit-timeline-files-${missionId}-${item.id}`}>
                    {item.affectedFiles.map((file) => (
                      <code key={file} className="rounded bg-background/70 px-1 py-0.5">
                        {file}
                      </code>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
      <CardFooter className="flex items-center gap-2 flex-wrap">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!lastRestorable?.restoreText}
          onClick={() => {
            if (lastRestorable?.restoreText) onRestorePatch(lastRestorable.restoreText);
          }}
          data-testid={`edit-timeline-restore-last-${missionId}`}
        >
          <RotateCcw size={11} /> 마지막 적용 patch 보기
        </Button>
        <span className="text-muted-foreground text-xs">
          textarea 복원만 수행 — 자동 적용 없음
        </span>
      </CardFooter>
    </Card>
  );
}
