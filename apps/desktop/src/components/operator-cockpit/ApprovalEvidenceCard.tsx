import React from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, Eye, FileText, Hash, ShieldCheck } from "lucide-react";
import type { OperatorCockpitApprovalEvidence } from "@ai-orchestrator/protocol";
import { Badge } from "./Badge";
import { GlassPanel, GlassPanelHeader } from "./GlassPanel";
import { operatorCockpitActionLabels } from "./actionLabels";
import { badgeColorForPayload, payloadBindingLabel } from "./presentation";

export function ApprovalEvidenceCard({
  approvals,
  onPreview,
}: {
  approvals: OperatorCockpitApprovalEvidence[];
  onPreview?: () => void;
}) {
  return (
    <GlassPanel variant={approvals.length > 0 ? "warning" : "default"}>
      <GlassPanelHeader action={<Badge color={approvals.length > 0 ? "yellow" : "green"}>{approvals.length}건 대기</Badge>}>
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-warning" />
          <h3 className="text-sm font-semibold text-foreground">승인 대기열</h3>
        </div>
      </GlassPanelHeader>

      {approvals.length === 0 ? (
        <div className="p-4 text-sm text-muted-foreground">대기 중인 승인이 없습니다.</div>
      ) : (
        <div className="space-y-3 p-3">
          {approvals.map((approval, idx) => (
            <article
              key={`${approval.blockReason}-${idx}`}
              className="overflow-hidden rounded-lg border border-border border-l-2 border-l-warning bg-muted/30 transition-colors hover:border-border"
            >
              <div className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">검토 필요</span>
                    <Badge color={badgeColorForPayload(approval.payloadBindingStatus)} size="xs">
                      {payloadBindingLabel(approval.payloadBindingStatus)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{approval.blockReason}</p>
                </div>
                {onPreview ? (
                  <button
                    aria-label={operatorCockpitActionLabels.previewApprovalEvidence}
                    className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    onClick={onPreview}
                    title={operatorCockpitActionLabels.previewApprovalEvidence}
                    type="button"
                  >
                    <Eye className="h-4 w-4 shrink-0" />
                  </button>
                ) : (
                  <Eye aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
              </div>

              {approval.commandPreview && (
                <div className="border-y border-border bg-muted/40 px-4 py-3">
                  <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">명령 미리보기</span>
                  <pre className="overflow-x-auto font-mono text-xs leading-relaxed text-primary">{approval.commandPreview}</pre>
                </div>
              )}

              <div className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    {approval.payloadBindingStatus === "bound" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                    )}
                    {payloadBindingLabel(approval.payloadBindingStatus)}
                  </span>
                  <span className="text-muted-foreground">/</span>
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Hash className="h-3.5 w-3.5" />
                    근거 {approval.evidenceRefs.length}건
                  </span>
                </div>

                {approval.evidenceRefs.length > 0 ? (
                  <div>
                    <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      근거 연결
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
                  <div className="flex items-center gap-2 text-[11px] text-primary">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    페이로드 묶임 확인됨
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-[11px] text-warning">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    운영자 확인 필요
                  </div>
                )}


              </div>
            </article>
          ))}
        </div>
      )}
    </GlassPanel>
  );
}
