import type { LoopStatus } from "../lib/closedLoopController";

/**
 * Hanko-style "slam-in" stamp for a finished run — 完了 / 失敗 / 承認待 / 実行中.
 * Pure presentational (CSS does the slam + rotate). The tone drives the color.
 */
export type StampTone = "success" | "danger" | "warning" | "info";

const STATUS_STAMP: Record<LoopStatus, { label: string; tone: StampTone }> = {
  completed: { label: "完了", tone: "success" },
  failed: { label: "失敗", tone: "danger" },
  awaiting_human: { label: "承認待", tone: "warning" },
  running: { label: "実行中", tone: "info" },
  cancelled: { label: "中止", tone: "info" },
};

export function stampForLoopStatus(status: LoopStatus): { label: string; tone: StampTone } {
  return STATUS_STAMP[status];
}

export function ResultStamp({ label, tone }: { label: string; tone: StampTone }) {
  return (
    <span className={`result-stamp result-stamp-${tone}`} role="img" aria-label={label}>
      {label}
    </span>
  );
}
