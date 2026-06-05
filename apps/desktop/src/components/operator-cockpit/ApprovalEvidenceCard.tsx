import React from 'react';
import type { OperatorCockpitApprovalEvidence } from '@ai-orchestrator/protocol';
import { Badge } from './Badge';

export function ApprovalEvidenceCard({ approvals }: { approvals: OperatorCockpitApprovalEvidence[] }) {
  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl hover:border-white/20 transition-all">
      <div className="flex items-center gap-3 mb-6">
        <span className="drop-shadow-[0_0_8px_var(--color-emerald-400)] text-xl">🛡️</span>
        <h3 className="text-lg font-semibold text-zinc-100">Approval Evidence</h3>
      </div>
      {approvals.length === 0 ? (
        <p className="text-sm text-zinc-500 font-mono">No pending approvals.</p>
      ) : (
        <div className="space-y-4">
          {approvals.map((approval, idx) => (
            <div key={idx} className="bg-black/40 border border-white/5 border-l-2 border-l-emerald-500 rounded-r-xl rounded-l-sm p-4 flex flex-col gap-3 group hover:bg-black/60 transition-colors">
              <div className="flex justify-between items-start">
                <span className="font-semibold text-zinc-100 flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Review Required
                </span>
                <Badge color={approval.payloadBindingStatus === 'bound' ? 'green' : 'red'}>
                  Payload: {approval.payloadBindingStatus}
                </Badge>
              </div>
              <p className="text-sm font-medium text-zinc-300">Reason: <span className="text-zinc-100">{approval.blockReason}</span></p>

              <div className="text-sm">
                <span className="font-semibold text-zinc-500 tracking-wider text-[10px] uppercase block mb-1">Evidence Chain</span>
                <ul className="space-y-1">
                  {approval.evidenceRefs.map((ev, i) => (
                    <li key={i} className="text-zinc-400 font-mono text-xs flex items-center gap-2">
                      <span className="text-emerald-500/50">›</span> {ev.summary}
                    </li>
                  ))}
                </ul>
              </div>

              {approval.commandPreview && (
                <div className="mt-2">
                  <span className="font-semibold text-zinc-500 tracking-wider text-[10px] uppercase">Command Preview</span>
                  <pre className="bg-zinc-950 text-cyan-400 p-3 rounded-lg text-xs mt-2 border border-white/5 font-mono shadow-inner overflow-x-auto">
                    {approval.commandPreview}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
