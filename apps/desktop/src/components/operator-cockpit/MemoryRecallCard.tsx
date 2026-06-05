import React from 'react';
import type { OperatorCockpitMemoryRecall } from '@ai-orchestrator/protocol';
import { Badge } from './Badge';

export function MemoryRecallCard({ memory }: { memory: OperatorCockpitMemoryRecall }) {
  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl hover:border-white/20 transition-all">
      <div className="flex items-center gap-3 mb-6">
        <span className="drop-shadow-[0_0_8px_var(--color-purple-400)] text-xl">🧠</span>
        <h3 className="text-lg font-semibold text-zinc-100">Memory Recall</h3>
      </div>

      <div className="mb-6">
        <span className="font-semibold text-zinc-500 tracking-wider text-[10px] uppercase block mb-3">Context Reasons</span>
        <ul className="space-y-2">
          {memory.contextReasons.map((reason, idx) => (
            <li key={idx} className="text-sm text-zinc-300 font-mono flex items-center gap-2">
              <span className="text-purple-500/50">›</span> {reason}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex gap-6 mb-6">
        <div className="bg-black/20 p-3 rounded-lg border border-white/5 flex-1">
          <span className="font-semibold text-zinc-500 tracking-wider text-[10px] uppercase block mb-2">MacBook Authority</span>
          <Badge color={memory.macBookAuthorityEnabled ? 'green' : 'gray'}>
            {memory.macBookAuthorityEnabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </div>
        <div className="bg-black/20 p-3 rounded-lg border border-white/5 flex-1">
          <span className="font-semibold text-zinc-500 tracking-wider text-[10px] uppercase block mb-2">DGX Mirror Health</span>
          <Badge color={memory.dgxMirrorHealth === 'healthy' ? 'green' : memory.dgxMirrorHealth === 'degraded' ? 'yellow' : 'red'}>
            {memory.dgxMirrorHealth}
          </Badge>
        </div>
      </div>

      {memory.contradictionWarnings.length > 0 && (
        <div className="bg-rose-500/10 p-4 rounded-xl border border-rose-500/20">
          <span className="text-sm font-semibold text-rose-400 flex items-center gap-2 mb-3">
            <span className="animate-pulse">⚠️</span> Contradiction Warnings
          </span>
          <ul className="space-y-1">
            {memory.contradictionWarnings.map((warning, idx) => (
              <li key={idx} className="text-sm text-rose-300 flex items-start gap-2">
                <span className="mt-1 opacity-70">-</span> <span>{warning}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
