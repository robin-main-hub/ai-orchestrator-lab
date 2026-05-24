import type { RuntimeSnapshot } from "@ai-orchestrator/protocol";

export function RuntimeStatusBar({
  onProbeDgx,
  providerName,
  snapshot,
}: {
  onProbeDgx: () => void;
  providerName: string;
  snapshot: RuntimeSnapshot;
}) {
  const primaryNode = snapshot.runtimeNodes.find((node) => node.isPrimary);

  return (
    <header className="status-bar">
      <div className="status-meta">
        <span>Active: {providerName}</span>
        <span>{primaryNode?.label ?? snapshot.syncTopology.authorityLabel}: {snapshot.dgxStatus}</span>
        <span>Local: {snapshot.localModelStatus}</span>
        <span>{snapshot.recentError ?? "ready"}</span>
      </div>
      <button className="status-action" onClick={onProbeDgx} type="button">
        Probe DGX
      </button>
    </header>
  );
}
