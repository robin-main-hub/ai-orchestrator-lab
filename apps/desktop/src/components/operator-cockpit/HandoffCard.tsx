import React from 'react';
import type { OperatorCockpitHandoff } from '@ai-orchestrator/protocol';

export function HandoffCard({ handoffs }: { handoffs: OperatorCockpitHandoff[] }) {
  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl hover:border-white/20 transition-all">
      <div className="flex items-center gap-3 mb-6">
        <span className="drop-shadow-[0_0_8px_var(--color-cyan-400)] text-xl">🤝</span>
        <h3 className="text-lg font-semibold text-zinc-100">Handoffs</h3>
      </div>
      {handoffs.length === 0 ? (
        <p className="text-sm text-zinc-500 font-mono">No active handoffs.</p>
      ) : (
        <div className="space-y-4">
          {handoffs.map((handoff, idx) => (
            <div key={idx} className="p-4 border border-white/5 bg-black/40 rounded-xl group hover:bg-black/60 transition-colors">
              <div className="flex items-center gap-3 mb-4 border-b border-white/5 pb-3">
                <span className="font-semibold text-zinc-500 tracking-wider text-[10px] uppercase">Owner</span>
                <span className="text-sm font-semibold text-cyan-400">{handoff.ownerAgentId}</span>
              </div>
              <div className="mb-4">
                <span className="font-semibold text-zinc-500 tracking-wider text-[10px] uppercase block mb-2">Next Action</span>
                <span className="text-sm text-zinc-300 font-mono leading-relaxed">{handoff.nextAction}</span>
              </div>
              {handoff.missingInfoSlots.length > 0 && (
                <div className="bg-amber-500/5 p-3 rounded-lg border border-amber-500/10">
                  <span className="font-semibold text-amber-500/70 tracking-wider text-[10px] uppercase block mb-2 flex items-center gap-2">
                    <span className="animate-pulse">⚠️</span> Missing Info
                  </span>
                  <ul className="space-y-1">
                    {handoff.missingInfoSlots.map((slot, i) => (
                      <li key={i} className="text-xs font-mono text-amber-400 flex items-center gap-2">
                        <span className="opacity-50">›</span> {slot.label} {slot.required && <span className="opacity-50">(Required)</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
