import React from 'react';
import type { OperatorCockpitWorkerFleet } from '@ai-orchestrator/protocol';
import { Badge } from './Badge';
import { StatusRing } from './StatusRing';

export function WorkerFleetCard({ fleet }: { fleet: OperatorCockpitWorkerFleet[] }) {
  return (
    <div className="bg-white p-4 rounded shadow">
      <h3 className="text-lg font-semibold mb-4">Worker Fleet</h3>
      <div className="space-y-4">
        {fleet.map((worker) => (
          <div key={worker.workerId} className="flex flex-col gap-2 p-3 border rounded">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StatusRing status={worker.statusRingColor} />
                <span className="font-medium">{worker.workerId}</span>
                <Badge color="blue">{worker.role}</Badge>
              </div>
              {worker.securityTier && (
                <Badge color="purple">{worker.securityTier}</Badge>
              )}
            </div>
            {(worker.worktree || worker.branch) && (
              <div className="text-sm text-gray-600">
                <span className="mr-3">📁 {worker.worktree}</span>
                <span>🌿 {worker.branch}</span>
              </div>
            )}
            {worker.blockedReason && (
              <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                🛑 Blocked: {worker.blockedReason}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
