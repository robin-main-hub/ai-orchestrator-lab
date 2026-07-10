import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import type { ActivityEntry } from "./annexData";
import { AnnexEmptyState } from "./AnnexEmptyState";

const toneIcon: Record<ActivityEntry["tone"], ComponentType<{ className?: string }>> = {
  info: CheckCircle2,
  warn: AlertTriangle,
  error: XCircle,
};

function toneClass(tone: ActivityEntry["tone"]): string {
  if (tone === "error") return "text-destructive";
  if (tone === "warn") return "text-warning";
  return "text-primary";
}

export function AnnexActivityPanel({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="annex-v2__scroll">
        <AnnexEmptyState icon={CheckCircle2} title="활동 기록이 없습니다" subtext="에이전트 흐름과 로그가 생기면 시간순으로 쌓입니다." />
      </div>
    );
  }

  return (
    <div className="annex-v2__scroll">
      <ol className="annex-v2__timeline">
        {entries.map((entry) => {
          const Icon = toneIcon[entry.tone];
          return (
            <li className="annex-v2__timeline-row" key={entry.id}>
              <Icon className={cn("annex-v2__timeline-icon size-4", toneClass(entry.tone))} aria-hidden="true" />
              <div className="annex-v2__timeline-body">
                <p className="annex-v2__timeline-primary">{entry.primary}</p>
                {entry.secondary ? <p className="annex-v2__timeline-secondary">{entry.secondary}</p> : null}
              </div>
              <span className="annex-v2__timeline-time aol-mono">{entry.timestamp}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
