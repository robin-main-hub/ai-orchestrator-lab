import React from "react";
import { AlertTriangle, CheckCircle2, Clock3, Fingerprint, History, ShieldCheck, XCircle } from "lucide-react";
import type { OperatorCockpitDispatchHistory } from "@ai-orchestrator/protocol";
import { Badge } from "./Badge";
import { GlassPanel, GlassPanelHeader } from "./GlassPanel";
import { approvalStateLabel, badgeColorForApproval, compactId, relativeMinutes } from "./presentation";

export function DispatchHistoryCard({ history }: { history: OperatorCockpitDispatchHistory[] }) {
  return (
    <GlassPanel>
      <GlassPanelHeader action={<Badge color="outline">{history.length}건</Badge>}>
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-zinc-100">승인 장부</h3>
        </div>
      </GlassPanelHeader>

      {history.length === 0 ? (
        <div className="p-4 text-sm text-zinc-500">승인 장부 기록이 없습니다.</div>
      ) : (
        <div className="space-y-2 p-3">
          {history.map((dispatch) => (
            <article
              key={dispatch.dispatchId}
              className="rounded-lg border border-zinc-800/50 bg-zinc-900/30 p-3 transition-colors hover:border-cyan-500/30"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <ApprovalIcon state={dispatch.approvalState} />
                    <span className="truncate text-sm font-medium text-zinc-200">{dispatch.requesterAgentId}</span>
                    <Badge color={badgeColorForApproval(dispatch.approvalState)} size="xs">
                      {approvalStateLabel(dispatch.approvalState)}
                    </Badge>
                    {dispatch.policyCode ? (
                      <Badge color="outline" size="xs">
                        {dispatch.policyCode}
                      </Badge>
                    ) : null}
                    {dispatch.sourceTrust ? (
                      <Badge color={dispatch.sourceTrust === "trusted" ? "green" : dispatch.sourceTrust === "limited" ? "yellow" : "red"} size="xs">
                        <ShieldCheck className="h-3 w-3" />
                        {sourceTrustLabel(dispatch.sourceTrust)}
                      </Badge>
                    ) : null}
                  </div>
                  {dispatch.actionSummary ? (
                    <div className="mt-1 text-xs font-medium text-zinc-300">{dispatch.actionSummary}</div>
                  ) : null}
                  {dispatch.decisionReason ? (
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-500">{dispatch.decisionReason}</p>
                  ) : null}
                  <span className="mt-1 flex items-center gap-1 text-[10px] text-zinc-600">
                    <Clock3 className="h-3 w-3" />
                    {relativeMinutes(dispatch.createdAt)}
                  </span>
                </div>
                <span className="shrink-0 rounded bg-black/30 px-2 py-1 font-mono text-[10px] text-zinc-500">
                  {dispatch.dispatchId}
                </span>
              </div>

              <div className="flex items-center gap-2 rounded-md border border-zinc-800/50 bg-black/30 px-3 py-2 font-mono text-xs text-zinc-400">
                <Fingerprint className="h-3.5 w-3.5 shrink-0 text-cyan-500/70" />
                <span className="truncate">{compactId(dispatch.replayPayloadDigest, 10)}</span>
                {dispatch.ledgerDigest ? (
                  <span className="ml-auto shrink-0 text-[10px] text-zinc-600">{compactId(dispatch.ledgerDigest, 10)}</span>
                ) : null}
              </div>

              {dispatch.tamperWarning && (
                <div className="mt-3 flex items-center gap-2 rounded-md border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {dispatch.tamperReason || "변조 경고 감지"}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </GlassPanel>
  );
}

function sourceTrustLabel(sourceTrust: NonNullable<OperatorCockpitDispatchHistory["sourceTrust"]>) {
  const labels: Record<typeof sourceTrust, string> = {
    limited: "제한 신뢰",
    trusted: "신뢰",
    untrusted: "비신뢰",
  };
  return labels[sourceTrust];
}

function ApprovalIcon({ state }: { state: OperatorCockpitDispatchHistory["approvalState"] }) {
  if (state === "approved" || state === "not_required") {
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />;
  }
  if (state === "rejected" || state === "expired") {
    return <XCircle className="h-4 w-4 shrink-0 text-rose-400" />;
  }
  return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />;
}
