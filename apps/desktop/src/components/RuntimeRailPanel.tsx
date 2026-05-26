import { Power, RefreshCw, Server } from "lucide-react";
import type { DeviceRebootRequest, DeviceRebootWatchdog, RuntimeSnapshot } from "@ai-orchestrator/protocol";
import { runtimeBadgeVariant } from "@/lib/statusBadgeMapping";
import { StatusBadge } from "@/ui/status-badge";
import type { Stage32DgxRouteDiagnosticSnapshot } from "../runtime/stage32DgxRouteDiagnostics";
import { statusTone } from "../lib/uiLabels";

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
            <em className={statusTone(node.status)}>
              <StatusBadge size="sm" variant={runtimeBadgeVariant(node.status)}>
                {node.status}
              </StatusBadge>
            </em>
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
          <strong className={statusTone(snapshot.memorySyncStatus)}>
            <StatusBadge size="sm" variant={runtimeBadgeVariant(snapshot.memorySyncStatus)}>
              {snapshot.memorySyncStatus}
            </StatusBadge>
          </strong>
        </div>
        <div>
          <span>mac outbox</span>
          <strong>{macbookOutbox}</strong>
        </div>
        <div>
          <span>home pc</span>
          <strong className={statusTone(homePcClient?.status ?? "degraded")}>
            <StatusBadge size="sm" variant={runtimeBadgeVariant(homePcClient?.status ?? "degraded")}>
              {homePcClient?.status === "online" ? "online-only" : "needs DGX"}
            </StatusBadge>
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
                health{" "}
                <StatusBadge size="sm" variant={runtimeBadgeVariant(route.health.status)}>
                  {route.health.status}
                </StatusBadge>
                {route.health.httpStatus ? `/${route.health.httpStatus}` : ""} · provider {route.providerPreflight.status}
                {route.providerPreflight.httpStatus ? `/${route.providerPreflight.httpStatus}` : ""}
              </span>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
