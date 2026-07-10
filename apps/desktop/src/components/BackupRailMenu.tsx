import { Archive, RefreshCw } from "lucide-react";
import type { BackupProjection } from "@ai-orchestrator/protocol";
import { StatusBadge, type StatusBadgeVariant } from "@/ui/status-badge";
import { backupStatusLabel } from "../lib/railStatusLabels";
import type { Stage7BackupSnapshot } from "../runtime/stage7Backup";

export function BackupRailMenu({
  onExportBackup,
  projections,
  snapshot,
}: {
  onExportBackup: () => void;
  projections: BackupProjection[];
  snapshot: Stage7BackupSnapshot;
}) {
  const redactionReady = projections.every((projection) => projection.redactionApplied);

  return (
    <section className="mgmt-mini-panel mgmt-panel backup-rail-panel">
      <header>
        <Archive size={16} />
        <span>백업</span>
        <button className="mgmt-icon-button" onClick={onExportBackup} aria-label="Projection 생성" title="Projection 생성" type="button">
          <RefreshCw size={13} />
        </button>
      </header>
      <div className="mgmt-stat-list">
        <div>
          <span>준비됨</span>
          <strong>{snapshot.summary.ready}</strong>
        </div>
        <div>
          <span>대기 중</span>
          <strong>{snapshot.summary.queued}</strong>
        </div>
        <div>
          <span>마스킹됨</span>
          <strong>{snapshot.summary.redacted}</strong>
        </div>
      </div>
      <div className="mgmt-card-list compact">
        {projections.map((projection) => (
          <article key={projection.id}>
            <strong>{projection.target}</strong>
            <span>
              <StatusBadge size="sm" variant={backupStatusBadgeVariant(projection.status)}>
                {backupStatusLabel(projection.status)}
              </StatusBadge>{" "}
              / 마스킹 {projection.redactionApplied ? "켜짐" : "꺼짐"}
            </span>
          </article>
        ))}
      </div>
      <div className="mgmt-card-list">
        {snapshot.artifacts.map((artifact) => (
          <article className={artifact.status} key={artifact.id}>
            <strong>{artifact.title}</strong>
            <span>
              <StatusBadge size="sm" variant={backupStatusBadgeVariant(artifact.status)}>
                {backupStatusLabel(artifact.status)}
              </StatusBadge>{" "}
              / {artifact.target} / {artifact.format}
            </span>
            <p>{artifact.destination}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function backupStatusBadgeVariant(status: string): StatusBadgeVariant {
  if (status === "ready" || status === "synced") return "success";
  if (status === "blocked" || status === "failed") return "danger";
  if (status === "queued" || status === "pending") return "warning";
  return "muted";
}
