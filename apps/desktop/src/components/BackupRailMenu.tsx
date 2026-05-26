import { Archive, RefreshCw } from "lucide-react";
import type { BackupProjection } from "@ai-orchestrator/protocol";
import { StatusBadge, type StatusBadgeVariant } from "@/ui/status-badge";
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
    <section className="mini-panel rail-panel backup-rail-panel">
      <header>
        <Archive size={16} />
        <span>Backup</span>
        <button className="rail-icon-button" onClick={onExportBackup} title="Projection 생성" type="button">
          <RefreshCw size={13} />
        </button>
      </header>
      <div className="rail-stat-list">
        <div>
          <span>ready</span>
          <strong>{snapshot.summary.ready}</strong>
        </div>
        <div>
          <span>queued</span>
          <strong>{snapshot.summary.queued}</strong>
        </div>
        <div>
          <span>redacted</span>
          <strong>{snapshot.summary.redacted}</strong>
        </div>
      </div>
      <div className="rail-card-list compact">
        {projections.map((projection) => (
          <article key={projection.id}>
            <strong>{projection.target}</strong>
            <span>
              <StatusBadge size="sm" variant={backupStatusBadgeVariant(projection.status)}>
                {projection.status}
              </StatusBadge>{" "}
              / redaction {projection.redactionApplied ? "on" : "off"}
            </span>
          </article>
        ))}
      </div>
      <div className="rail-card-list">
        {snapshot.artifacts.map((artifact) => (
          <article className={artifact.status} key={artifact.id}>
            <strong>{artifact.title}</strong>
            <span>
              <StatusBadge size="sm" variant={backupStatusBadgeVariant(artifact.status)}>
                {artifact.status}
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

