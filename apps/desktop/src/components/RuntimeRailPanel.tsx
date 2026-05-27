import { Power, RefreshCw, Server } from "lucide-react";
import type { DeviceRebootRequest, DeviceRebootWatchdog, RuntimeSnapshot } from "@ai-orchestrator/protocol";
import type { Stage32DgxRouteDiagnosticSnapshot } from "../runtime/stage32DgxRouteDiagnostics";
import { StatusBadge } from "@/ui/status-badge";

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
            <StatusBadge
              size="sm"
              variant={
                node.status === "online"
                  ? "success"
                  : node.status === "offline"
                    ? "danger"
                    : "warning"
              }
              className="mt-1 w-fit"
            >
              {node.status}
            </StatusBadge>
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
          <StatusBadge
            size="sm"
            variant={
              snapshot.memorySyncStatus === "online"
                ? "success"
                : snapshot.memorySyncStatus === "offline"
                  ? "danger"
                  : "warning"
            }
          >
            {snapshot.memorySyncStatus}
          </StatusBadge>
        </div>
        <div>
          <span>mac outbox</span>
          <strong>{macbookOutbox}</strong>
        </div>
        <div>
          <span>home pc</span>
          <StatusBadge
            size="sm"
            variant={homePcClient?.status === "online" ? "success" : "danger"}
          >
            {homePcClient?.status === "online" ? "online-only" : "needs DGX"}
          </StatusBadge>
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
    </section>
  );
}
