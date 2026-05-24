import { Archive, ShieldCheck } from "lucide-react";
import type { BackupProjection } from "@ai-orchestrator/protocol";
import type { Stage7BackupSnapshot } from "../runtime/stage7Backup";

export function BackupPanel({
  onExport,
  projectionPreview,
  projections,
  snapshot,
}: {
  onExport: () => void;
  projectionPreview: string;
  projections: BackupProjection[];
  snapshot: Stage7BackupSnapshot;
}) {
  return (
    <section className="side-panel compact">
      <header className="panel-title">
        <ShieldCheck size={17} />
        <h2>Backup</h2>
        <button aria-label="backup projection 생성" className="icon-button" onClick={onExport} type="button">
          <Archive size={15} />
        </button>
      </header>
      <div className="backup-grid">
        {projections.map((projection) => (
          <div className="backup-cell" key={projection.id}>
            <span>{projection.target}</span>
            <strong>{projection.status}</strong>
          </div>
        ))}
      </div>
      <div className="backup-summary">
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
      <div className="backup-artifact-list" aria-label="Backup artifacts">
        {snapshot.artifacts.map((artifact) => (
          <article className={artifact.status} key={artifact.id}>
            <div>
              <strong>{artifact.title}</strong>
              <span>{artifact.destination}</span>
            </div>
            <em>{artifact.status}</em>
            <small>{artifact.format} / {artifact.byteLength} bytes</small>
          </article>
        ))}
      </div>
      <div className="mobile-policy-list">
        <span>Mobile</span>
        <strong>read / approve / stop / retry</strong>
        <em>terminal, secrets, merge/push denied</em>
      </div>
      <div className="backup-preview">
        <span>Obsidian projection</span>
        <strong>{projectionPreview ? `${projectionPreview.length} chars ready` : "not rendered"}</strong>
      </div>
    </section>
  );
}
