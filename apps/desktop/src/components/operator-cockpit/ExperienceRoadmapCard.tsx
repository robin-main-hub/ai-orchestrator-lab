import { Compass, ShieldAlert } from "lucide-react";
import type { ExperienceRoadmapItem } from "../../lib/orchestrationExperienceRoadmap";
import { Badge } from "./Badge";
import { GlassPanel, GlassPanelHeader } from "./GlassPanel";

export function ExperienceRoadmapCard({ items }: { items: ExperienceRoadmapItem[] }) {
  const liveCount = items.filter((item) => item.status === "live").length;
  const blockedCount = items.filter((item) => item.status === "blocked").length;
  const nextCount = items.length - liveCount - blockedCount;

  return (
    <GlassPanel ariaLabel="20개 큰 바위 로드맵" variant={blockedCount > 0 ? "warning" : "glow"}>
      <GlassPanelHeader
        action={
          <div className="flex flex-wrap justify-end gap-1.5">
            <Badge color="green" size="xs">가동 {liveCount}</Badge>
            <Badge color={nextCount > 0 ? "yellow" : "gray"} size="xs">다음 {nextCount}</Badge>
            {blockedCount > 0 ? <Badge color="red" size="xs">막힘 {blockedCount}</Badge> : null}
          </div>
        }
      >
        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4 text-primary" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">20개 큰 바위 로드맵</h2>
            <p className="text-xs text-muted-foreground">Kimi/Manus/v0 조사에서 가져온 성숙한 OS 기준</p>
          </div>
        </div>
      </GlassPanelHeader>

      <div className="grid gap-2 p-4 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item, index) => (
          <RoadmapTile item={item} index={index + 1} key={item.id} />
        ))}
      </div>
    </GlassPanel>
  );
}

function RoadmapTile({ item, index }: { item: ExperienceRoadmapItem; index: number }) {
  return (
    <article className={`min-w-0 rounded-lg border px-3 py-3 ${tileClassName(item.status)}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold text-muted-foreground">#{String(index).padStart(2, "0")}</p>
          <h3 className="mt-1 truncate text-[12px] font-semibold text-foreground" title={item.label}>
            {item.label}
          </h3>
        </div>
        <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${sourceClassName(item.source)}`}>
          {sourceLabel(item.source)}
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-[10px] leading-4 text-muted-foreground">{item.detail}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${statusClassName(item.status)}`}>
          {item.status === "blocked" ? <ShieldAlert className="h-3 w-3" /> : null}
          {statusLabel(item.status)}
        </span>
      </div>
    </article>
  );
}

function tileClassName(status: ExperienceRoadmapItem["status"]) {
  if (status === "blocked") return "border-destructive/20 bg-destructive/15";
  if (status === "live") return "border-primary/15 bg-primary/[0.045]";
  return "border-border bg-muted/35";
}

function statusClassName(status: ExperienceRoadmapItem["status"]) {
  if (status === "blocked") return "bg-destructive/10 text-destructive";
  if (status === "live") return "bg-primary/10 text-primary";
  return "bg-warning/10 text-warning";
}

function statusLabel(status: ExperienceRoadmapItem["status"]) {
  if (status === "blocked") return "막힘";
  if (status === "live") return "가동";
  return "다음";
}

function sourceClassName(source: ExperienceRoadmapItem["source"]) {
  if (source === "v0") return "border-primary/20 bg-primary/10 text-primary";
  if (source === "warp") return "border-warning/20 bg-warning/10 text-warning";
  if (source === "cline") return "border-destructive/20 bg-destructive/10 text-destructive";
  if (source === "linear") return "border-primary/20 bg-primary/10 text-primary";
  return "border-border bg-muted/80 text-muted-foreground";
}

function sourceLabel(source: ExperienceRoadmapItem["source"]) {
  const labels: Record<ExperienceRoadmapItem["source"], string> = {
    arc: "Arc",
    cline: "Cline",
    cursor: "Cursor",
    linear: "Linear",
    notion: "Notion",
    raycast: "Raycast",
    v0: "v0",
    warp: "Warp",
  };
  return labels[source];
}
