import { Power, RefreshCw, Server } from "lucide-react";
import type { DeviceRebootRequest, DeviceRebootWatchdog, RuntimeSnapshot } from "@ai-orchestrator/protocol";
import type { Stage32DgxRouteDiagnosticSnapshot } from "../runtime/stage32DgxRouteDiagnostics";
import { statusTone } from "../lib/uiLabels";
import type { WindowAuditItem } from "../types";
import { WindowChecklist } from "./WindowChecklist";

export function RuntimeRailPanel({
  dgxRouteDiagnostics,
  onProbeDgx,
  onRequestReboot,
  rebootWatchdogs,
  snapshot,
}: {
  dgxRouteDiagnostics?: Stage32DgxRouteDiagnosticSnapshot;
  onProbeDgx: () => void;
  onRequestReboot: (targetNodeId: DeviceRebootRequest["targetNodeId"]) => void;
  rebootWatchdogs: DeviceRebootWatchdog[];
  snapshot: RuntimeSnapshot;
}) {
  const macbookClient = snapshot.syncTopology.clients.find((client) => client.id === "client_macbook");
  const homePcClient = snapshot.syncTopology.clients.find((client) => client.id === "client_home_pc");
  const macbookOutbox = macbookClient?.outboxCount ?? 0;
  const dgx02 = snapshot.runtimeNodes.find((node) => node.id === "dgx-02");
  const activeWatchdog = rebootWatchdogs[0];
  const auditItems: WindowAuditItem[] = [
    {
      id: "dgx01-locked",
      label: "DGX-01 보호",
      status: "ready",
      detail: "DGX-01은 locked로만 표시하고 작업 대상으로 잡지 않습니다.",
    },
    {
      id: "dgx02-authority",
      label: "DGX-02 원본",
      status: dgx02?.isPrimary ? "ready" : "blocked",
      detail: "세션/이벤트/공유 데이터의 authoritative server입니다.",
    },
    {
      id: "local-fallback",
      label: "로컬 폴백",
      status: snapshot.localModelStatus === "online" ? "ready" : "partial",
      detail: "DGX-02가 내려가면 로컬 모델, 로컬 로그, outbox만 살아납니다.",
    },
  ];

  return (
    <section className="mini-panel rail-panel">
      <header>
        <Server size={16} />
        <span>Systems</span>
        <button className="rail-icon-button" onClick={onProbeDgx} title="Probe DGX-02" type="button">
          <RefreshCw size={13} />
        </button>
      </header>
      <div className="rail-node-grid">
        {snapshot.runtimeNodes.map((node) => (
          <article className={node.id === "dgx-01" ? "locked" : ""} key={node.id}>
            <div className="rail-node-head">
              <span>{node.label}</span>
              <button
                className="rail-icon-button"
                onClick={() => onRequestReboot(node.id as DeviceRebootRequest["targetNodeId"])}
                title={`${node.label} reboot approval`}
                type="button"
              >
                <Power size={12} />
              </button>
            </div>
            <strong>{node.id === "dgx-01" ? "guarded" : node.isPrimary ? "main" : node.role}</strong>
            <em className={statusTone(node.status)}>{node.status}</em>
          </article>
        ))}
      </div>
      <div className="rail-stat-list">
        <div>
          <span>authority</span>
          <strong>{snapshot.syncTopology.authorityLabel}</strong>
        </div>
        <div>
          <span>local models</span>
          <strong>{snapshot.localModels.length}</strong>
        </div>
        <div>
          <span>memento</span>
          <strong className={statusTone(snapshot.memorySyncStatus)}>{snapshot.memorySyncStatus}</strong>
        </div>
        <div>
          <span>mac outbox</span>
          <strong>{macbookOutbox}</strong>
        </div>
        <div>
          <span>home pc</span>
          <strong className={statusTone(homePcClient?.status ?? "degraded")}>
            {homePcClient?.status === "online" ? "online-only" : "needs DGX"}
          </strong>
        </div>
        <div>
          <span>heartbeat</span>
          <strong>{snapshot.recentError ?? "connected"}</strong>
        </div>
        <div>
          <span>watchdog</span>
          <strong>{activeWatchdog ? `${activeWatchdog.targetNodeId} ${activeWatchdog.status}` : "ready"}</strong>
        </div>
      </div>
      {dgxRouteDiagnostics ? (
        <div className="dgx-route-diagnostic-list">
          {dgxRouteDiagnostics.routes.map((route) => (
            <article key={route.baseUrl}>
              <strong>{route.baseUrl.replace(/^https?:\/\//, "")}</strong>
              <span>
                health {route.health.status}
                {route.health.httpStatus ? `/${route.health.httpStatus}` : ""} · provider {route.providerPreflight.status}
                {route.providerPreflight.httpStatus ? `/${route.providerPreflight.httpStatus}` : ""}
              </span>
            </article>
          ))}
        </div>
      ) : null}
      <WindowChecklist items={auditItems} title="시스템 창 점검" />
    </section>
  );
}
