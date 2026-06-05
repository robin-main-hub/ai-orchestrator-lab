import React from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, Eye, FileText, Hash, ShieldCheck } from "lucide-react";
import type { OperatorCockpitApprovalEvidence } from "@ai-orchestrator/protocol";
import { Badge } from "./Badge";
import { GlassPanel, GlassPanelHeader } from "./GlassPanel";
import { operatorCockpitActionLabels } from "./actionLabels";
import { badgeColorForPayload } from "./presentation";

export function ApprovalEvidenceCard({
  approvals,
  onPreview,
}: {
  approvals: OperatorCockpitApprovalEvidence[];
  onPreview?: () => void;
}) {
  return (
    <GlassPanel variant={approvals.length > 0 ? "warning" : "default"}>
      <GlassPanelHeader action={<Badge color={approvals.length > 0 ? "yellow" : "green"}>{approvals.length} pending</Badge>}>
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-zinc-100">Approval Queue</h3>
        </div>
      </GlassPanelHeader>

      {approvals.length === 0 ? (
        <div className="p-4 text-sm text-zinc-500">No pending approvals.</div>
      ) : (
        <div className="space-y-3 p-3">
          {approvals.map((approval, idx) => (
            <article
              key={`${approval.blockReason}-${idx}`}
              className="overflow-hidden rounded-lg border border-zinc-800/50 border-l-2 border-l-amber-500 bg-zinc-900/30 transition-colors hover:border-zinc-700/80"
            >
              <div className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-100">Review Required</span>
                    <Badge color={badgeColorForPayload(approval.payloadBindingStatus)} size="xs">
                      {approval.payloadBindingStatus}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-400">{approval.blockReason}</p>
                </div>
                {onPreview ? (
                  <button
                    aria-label={operatorCockpitActionLabels.previewApprovalEvidence}
                    className="rounded p-1.5 text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50"
                    onClick={onPreview}
                    title={operatorCockpitActionLabels.previewApprovalEvidence}
                    type="button"
                  >
                    <Eye className="h-4 w-4 shrink-0" />
                  </button>
                ) : (
                  <Eye aria-hidden className="h-4 w-4 shrink-0 text-zinc-600" />
                )}
              </div>

              {approval.commandPreview && (
                <div className="border-y border-zinc-800/50 bg-black/30 px-4 py-3">
                  <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Command Preview</span>
                  <pre className="overflow-x-auto font-mono text-xs leading-relaxed text-cyan-300">{approval.commandPreview}</pre>
                </div>
              )}

              <div className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 text-zinc-500">
                    {approval.payloadBindingStatus === "bound" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                    )}
                    Payload {approval.payloadBindingStatus}
                  </span>
                  <span className="text-zinc-700">/</span>
                  <span className="inline-flex items-center gap-1 text-zinc-500">
                    <Hash className="h-3.5 w-3.5" />
                    evidence {approval.evidenceRefs.length}
                  </span>
                </div>

                {approval.evidenceRefs.length > 0 ? (
                  <div>
                    <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                      Evidence Chain
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {approval.evidenceRefs.map((ev) => (
                        <Badge key={`${ev.kind}-${ev.id}`} color="green" size="xs">
                          <FileText className="h-3 w-3" />
                          {ev.summary}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}

                {approval.payloadBindingStatus === "bound" ? (
                  <div className="flex items-center gap-2 text-[11px] text-emerald-400">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Payload binding verified
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-[11px] text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Payload requires operator attention
                  </div>
                )}

                {approval.tamperWarning ? (
                  <div className="mt-2 flex items-center gap-2 rounded bg-rose-500/10 px-2 py-1.5 text-[11px] font-semibold text-rose-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    TAMPER WARNING: {approval.securityRisk || "Payload signature verification failed"}
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </GlassPanel>
  );
}
