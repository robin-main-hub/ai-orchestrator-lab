import React from 'react';
import type { OperatorCockpitProviderRouting } from '@ai-orchestrator/protocol';
import { Badge } from './Badge';

export function ProviderRoutingCard({ routing }: { routing: OperatorCockpitProviderRouting }) {
  return (
    <div className="bg-purple-500/10 backdrop-blur-xl border border-purple-500/30 rounded-2xl p-6 shadow-xl hover:shadow-[0_0_25px_rgba(168,85,247,0.15)] transition-all relative overflow-hidden group">
      {/* Ethereal tracking line and bounce animation */}
      <div className="absolute top-0 left-6 w-px h-full bg-gradient-to-b from-purple-500/50 to-transparent"></div>
      <div className="absolute top-0 left-[23px] w-1 h-4 bg-purple-400 shadow-[0_0_8px_var(--color-purple-400)] animate-bounce rounded-full"></div>

      <div className="pl-6 relative">
        <h3 className="text-lg font-semibold mb-6 text-purple-400 drop-shadow-[0_0_8px_var(--color-purple-400)] flex items-center gap-2">
          <span>📡</span> Provider Provenance
        </h3>

        <div className="mb-6 bg-black/40 border border-purple-500/20 rounded-xl p-4">
          <span className="font-semibold text-zinc-500 tracking-wider text-[10px] uppercase block mb-2">Selected Route</span>
          <span className="font-mono text-sm text-purple-300 tracking-wide">{routing.selectedModelId}</span>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-black/20 p-3 rounded-lg border border-white/5">
            <span className="font-semibold text-zinc-500 tracking-wider text-[10px] uppercase block mb-2">Fallback Status</span>
            <Badge color={routing.fallbackStatus === 'active' ? 'yellow' : routing.fallbackStatus === 'available' ? 'green' : 'gray'}>
              {routing.fallbackStatus}
            </Badge>
          </div>
          <div className="bg-black/20 p-3 rounded-lg border border-white/5">
            <span className="font-semibold text-zinc-500 tracking-wider text-[10px] uppercase block mb-2">Source Trust</span>
            <Badge color="purple">{routing.trustBadge}</Badge>
          </div>
        </div>

        <div className="flex gap-2">
          <Badge color="blue">Cost: {routing.costBadge}</Badge>
          <Badge color="blue">Speed: {routing.speedBadge}</Badge>
        </div>
      </div>
    </div>
  );
}
