import { Archive, RefreshCw } from "lucide-react";
import type { BackupProjection } from "@ai-orchestrator/protocol";
import type { Stage7BackupSnapshot } from "../runtime/stage7Backup";
import type { WindowAuditItem } from "../types";
import { WindowChecklist } from "./WindowChecklist";

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
  const auditItems: WindowAuditItem[] = [
    {
      id: "source",
      label: "원본 위치",
      status: "ready",
      detail: "Obsidian/Notion/Mobile은 projection이고 원본은 Event Storage입니다.",
    },
    {
      id: "redaction",
      label: "Redaction",
      status: redactionReady ? "ready" : "blocked",
      detail: "API key, bearer token, terminal secret은 export 전에 제거합니다.",
    },
    {
      id: "obsidian",
      label: "Obsidian",
      status: projections.some((projection) => projection.target === "obsidian") ? "ready" : "partial",
      detail: "맥북 vault에는 markdown artifact로 남길 수 있게 유지합니다.",
    },
    {
      id: "mobile",
      label: "Mobile",
      status: projections.some((projection) => projection.target === "mobile") ? "partial" : "blocked",
      detail: "폰은 읽기/승인/중단/재시도만 허용하고 파일/터미널 직접 조작은 막습니다.",
    },
  ];

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
            <span>{projection.status} / redaction {projection.redactionApplied ? "on" : "off"}</span>
          </article>
        ))}
      </div>
      <div className="rail-card-list">
        {snapshot.artifacts.map((artifact) => (
          <article className={artifact.status} key={artifact.id}>
            <strong>{artifact.title}</strong>
            <span>{artifact.target} / {artifact.format}</span>
            <p>{artifact.destination}</p>
          </article>
        ))}
      </div>
      <WindowChecklist items={auditItems} title="백업 창 점검" />
    </section>
  );
}

