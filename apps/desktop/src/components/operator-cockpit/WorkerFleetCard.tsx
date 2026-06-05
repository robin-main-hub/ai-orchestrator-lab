import React from 'react';
import type { OperatorCockpitWorkerFleet } from '@ai-orchestrator/protocol';
import { Badge } from './Badge';
import { StatusRing } from './StatusRing';

export function WorkerFleetCard({ fleet }: { fleet: OperatorCockpitWorkerFleet[] }) {
  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl hover:border-white/20 transition-all">
      <div className="flex items-center gap-3 mb-6">
        <div className="size-2 rounded-full bg-emerald-500 shadow-[0_0_8px_var(--color-emerald-500)] animate-pulse"></div>
        <h3 className="text-lg font-semibold text-zinc-100">Worker Fleet</h3>
      </div>
      <div className="space-y-4">
        {fleet.map((worker) => (
          <div key={worker.workerId} className="flex flex-col gap-3 p-4 border border-white/5 bg-zinc-900/50 backdrop-blur-md rounded-xl hover:border-cyan-500/30 transition-colors group">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <StatusRing status={worker.statusRingColor} />
                <span className="font-medium text-zinc-100 group-hover:text-cyan-400 transition-colors">{worker.workerId}</span>
                <Badge color="blue">{worker.role}</Badge>
              </div>
              {worker.securityTier && (
                <Badge color="purple">{worker.securityTier}</Badge>
              )}
            </div>
            {(worker.worktree || worker.branch) && (
              <div className="text-xs text-zinc-400 font-mono tracking-wide flex items-center gap-4">
                <span className="flex items-center gap-1"><span className="text-cyan-500/70">📁</span> {worker.worktree}</span>
                <span className="flex items-center gap-1"><span className="text-emerald-500/70">🌿</span> {worker.branch}</span>
              </div>
            )}
            {worker.blockedReason && (
              <div className="text-sm text-amber-400 bg-amber-400/10 border border-amber-400/20 px-3 py-2 rounded-lg flex items-center gap-2">
                <span className="animate-pulse">⚠️</span> Blocked: {worker.blockedReason}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
