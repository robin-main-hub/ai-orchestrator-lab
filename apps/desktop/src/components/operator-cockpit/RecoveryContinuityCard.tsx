import React from 'react';
import type { OperatorCockpitRecovery } from '@ai-orchestrator/protocol';
import { Badge } from './Badge';

export function RecoveryContinuityCard({ recovery }: { recovery: OperatorCockpitRecovery }) {
  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl hover:border-white/20 transition-all">
      <div className="flex items-center gap-3 mb-6">
        <span className="drop-shadow-[0_0_8px_var(--color-emerald-400)] text-xl">🏥</span>
        <h3 className="text-lg font-semibold text-zinc-100">Recovery & Continuity</h3>
      </div>

      <div className="flex gap-6 mb-6">
        <div className="bg-black/20 p-3 rounded-lg border border-white/5 flex-1">
          <span className="font-semibold text-zinc-500 tracking-wider text-[10px] uppercase block mb-2">Offline Resume</span>
          <Badge color={recovery.offlineResumeSupported ? 'green' : 'gray'}>
            {recovery.offlineResumeSupported ? 'Supported' : 'Unsupported'}
          </Badge>
        </div>
        <div className="bg-black/20 p-3 rounded-lg border border-white/5 flex-1">
          <span className="font-semibold text-zinc-500 tracking-wider text-[10px] uppercase block mb-2">Outbox Sync</span>
          <Badge color={recovery.outboxSyncStatus === 'synced' ? 'green' : recovery.outboxSyncStatus === 'pending' ? 'yellow' : 'red'}>
            {recovery.outboxSyncStatus}
          </Badge>
        </div>
      </div>

      <div>
        <span className="font-semibold text-zinc-500 tracking-wider text-[10px] uppercase block mb-3">Health Indicators</span>
        <div className="flex flex-wrap gap-2">
          {recovery.healthIndicators.map((indicator, idx) => (
            <Badge key={idx} color={indicator.toLowerCase().includes('warning') || indicator.toLowerCase().includes('degraded') ? 'yellow' : 'gray'}>
              {indicator}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}
