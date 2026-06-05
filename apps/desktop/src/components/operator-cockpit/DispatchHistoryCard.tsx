import React from 'react';
import type { OperatorCockpitDispatchHistory } from '@ai-orchestrator/protocol';
import { Badge } from './Badge';

export function DispatchHistoryCard({ history }: { history: OperatorCockpitDispatchHistory[] }) {
  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl hover:border-white/20 transition-all">
      <div className="flex items-center gap-3 mb-6">
        <span className="drop-shadow-[0_0_8px_var(--color-cyan-400)] text-xl">⏱️</span>
        <h3 className="text-lg font-semibold text-zinc-100">Dispatch History</h3>
      </div>

      {history.length === 0 ? (
        <p className="text-sm text-zinc-500 font-mono">No dispatch history.</p>
      ) : (
        <div className="space-y-4">
          {history.map((dispatch) => (
            <div key={dispatch.dispatchId} className="p-4 border border-white/5 bg-zinc-900/50 rounded-xl group hover:border-cyan-500/30 transition-colors text-sm">
              <div className="flex justify-between items-center mb-3">
                <span className="font-medium text-zinc-300">Requester: <span className="text-cyan-400">{dispatch.requesterAgentId}</span></span>
                <span className="text-zinc-500 font-mono text-xs bg-black/40 px-2 py-1 rounded-md">{new Date(dispatch.createdAt).toLocaleTimeString()}</span>
              </div>

              <div className="mb-3">
                <Badge color={dispatch.approvalState === 'approved' ? 'green' : dispatch.approvalState === 'rejected' ? 'red' : 'gray'}>
                  {dispatch.approvalState}
                </Badge>
              </div>

              <div className="bg-black/50 p-3 rounded-lg font-mono text-xs text-zinc-400 truncate border border-white/5 shadow-inner group-hover:text-cyan-400/70 transition-colors">
                {dispatch.replayPayloadDigest}
              </div>

              {dispatch.tamperWarning && (
                <div className="mt-3 text-rose-400 font-bold bg-rose-500/10 p-2 rounded-lg border border-rose-500/20 flex items-center gap-2 animate-pulse">
                  <span>⚠️</span> TAMPER WARNING DETECTED
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
