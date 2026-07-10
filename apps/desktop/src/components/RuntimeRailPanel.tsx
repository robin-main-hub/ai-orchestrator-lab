import { Power, RefreshCw, Server } from "lucide-react";
import type { DeviceRebootRequest, DeviceRebootWatchdog, RuntimeSnapshot } from "@ai-orchestrator/protocol";
import type { Stage32DgxRouteDiagnosticSnapshot } from "../runtime/stage32DgxRouteDiagnostics";
import { StatusBadge } from "@/ui/status-badge";
import { runtimeNodeRoleLabel, runtimeStatusLabel } from "../lib/railStatusLabels";

export function RuntimeRailPanel({
  dgxRouteDiagnostics,
  onProbeDgx,
  onRequestReboot,
  rebootWatchdogs,
  snapshot,
}: {
  dgxRouteDiagnostics?: Stage32DgxRouteDiagnosticSnapshot;
  onProbeDgx: () => void;
  /** Reboot approval request. Omit on read-only surfaces — the reboot control is
   *  then absent (no destructive node-restart entry point). */
  onRequestReboot?: (targetNodeId: DeviceRebootRequest["targetNodeId"]) => void;
  rebootWatchdogs: DeviceRebootWatchdog[];
  snapshot: RuntimeSnapshot;
}) {
  const macbookClient = snapshot.syncTopology.clients.find((client) => client.id === "client_macbook");
  const homePcClient = snapshot.syncTopology.clients.find((client) => client.id === "client_home_pc");
  const macbookOutbox = macbookClient?.outboxCount ?? 0;
  const dgx02 = snapshot.runtimeNodes.find((node) => node.id === "dgx-02");
  const activeWatchdog = rebootWatchdogs[0];

  return (
    <section className="mgmt-mini-panel mgmt-panel">
      <header>
        <Server size={16} />
        <span>시스템</span>
        <button className="mgmt-icon-button" onClick={onProbeDgx} aria-label="DGX-02 점검" title="DGX-02 점검" type="button">
          <RefreshCw size={13} />
        </button>
      </header>
      <div className="mgmt-node-grid">
        {snapshot.runtimeNodes.map((node) => (
          <article className={node.id === "dgx-01" ? "locked" : ""} key={node.id}>
            <div className="mgmt-node-head">
              <span>{node.label}</span>
              {onRequestReboot ? (
                <button
                  aria-label={`${node.label} 재시작 승인`}
                  className="mgmt-icon-button is-destructive"
                  onClick={() => onRequestReboot(node.id as DeviceRebootRequest["targetNodeId"])}
                  title={`${node.label} 재시작 승인`}
                  type="button"
                >
                  <Power size={12} />
                </button>
              ) : null}
            </div>
            <strong>{runtimeNodeRoleLabel(node.id === "dgx-01" ? "guarded" : node.isPrimary ? "main" : node.role)}</strong>
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
              {runtimeStatusLabel(node.status)}
            </StatusBadge>
          </article>
        ))}
      </div>
      <div className="mgmt-stat-list">
        <div>
          <span>권한</span>
          <strong>{snapshot.syncTopology.authorityLabel}</strong>
        </div>
        <div>
          <span>로컬 모델</span>
          <strong>{snapshot.localModels.length}</strong>
        </div>
        <div>
          <span>기억</span>
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
            {runtimeStatusLabel(snapshot.memorySyncStatus)}
          </StatusBadge>
        </div>
        <div>
          <span>Mac 발신함</span>
          <strong>{macbookOutbox}</strong>
        </div>
        <div>
          <span>홈 PC</span>
          <StatusBadge
            size="sm"
            variant={homePcClient?.status === "online" ? "success" : "danger"}
          >
            {homePcClient?.status === "online" ? "온라인 전용" : "DGX 필요"}
          </StatusBadge>
        </div>
        <div>
          <span>하트비트</span>
          <strong>{snapshot.recentError ?? "연결됨"}</strong>
        </div>
        <div>
          <span>감시</span>
          <strong>{activeWatchdog ? `${activeWatchdog.targetNodeId} ${runtimeStatusLabel(activeWatchdog.status)}` : "준비됨"}</strong>
        </div>
      </div>
      {dgxRouteDiagnostics ? (
        <div className="dgx-route-diagnostic-list">
          {dgxRouteDiagnostics.routes.map((route) => (
            <article key={route.baseUrl}>
              <strong>{route.baseUrl.replace(/^https?:\/\//, "")}</strong>
              <span>
                상태 {runtimeStatusLabel(route.health.status)}
                {route.health.httpStatus ? `/${route.health.httpStatus}` : ""} · 프로바이더 {runtimeStatusLabel(route.providerPreflight.status)}
                {route.providerPreflight.httpStatus ? `/${route.providerPreflight.httpStatus}` : ""}
              </span>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
