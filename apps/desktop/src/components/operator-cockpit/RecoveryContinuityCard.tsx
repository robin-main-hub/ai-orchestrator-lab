import React from 'react';
import type { OperatorCockpitRecovery } from '@ai-orchestrator/protocol';
import { Badge } from './Badge';

export function RecoveryContinuityCard({ recovery }: { recovery: OperatorCockpitRecovery }) {
  return (
    <div className="bg-white p-4 rounded shadow">
      <h3 className="text-lg font-semibold mb-4">Recovery & Continuity</h3>
      
      <div className="flex gap-4 mb-4">
        <div>
          <span className="text-sm font-medium text-gray-500 block mb-1">Offline Resume</span>
          <Badge color={recovery.offlineResumeSupported ? 'green' : 'gray'}>
            {recovery.offlineResumeSupported ? 'Supported' : 'Unsupported'}
          </Badge>
        </div>
        <div>
          <span className="text-sm font-medium text-gray-500 block mb-1">Outbox Sync</span>
          <Badge color={recovery.outboxSyncStatus === 'synced' ? 'green' : recovery.outboxSyncStatus === 'pending' ? 'yellow' : 'red'}>
            {recovery.outboxSyncStatus}
          </Badge>
        </div>
      </div>

      <div>
        <span className="text-sm font-medium text-gray-500 block mb-1">Health Indicators:</span>
        <div className="flex flex-wrap gap-2">
          {recovery.healthIndicators.map((indicator, idx) => (
            <Badge key={idx} color="gray">{indicator}</Badge>
          ))}
        </div>
      </div>
    </div>
  );
}
