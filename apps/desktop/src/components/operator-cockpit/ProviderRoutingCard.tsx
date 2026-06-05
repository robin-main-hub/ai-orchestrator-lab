import React from 'react';
import type { OperatorCockpitProviderRouting } from '@ai-orchestrator/protocol';
import { Badge } from './Badge';

export function ProviderRoutingCard({ routing }: { routing: OperatorCockpitProviderRouting }) {
  return (
    <div className="bg-white p-4 rounded shadow">
      <h3 className="text-lg font-semibold mb-4">Provider Routing</h3>

      <div className="mb-4">
        <span className="text-sm font-medium text-gray-500 block mb-1">Selected Model:</span>
        <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">{routing.selectedModelId}</span>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <span className="text-sm font-medium text-gray-500 block mb-1">Fallback Status:</span>
          <Badge color={routing.fallbackStatus === 'active' ? 'yellow' : routing.fallbackStatus === 'available' ? 'green' : 'gray'}>
            {routing.fallbackStatus}
          </Badge>
        </div>
        <div>
          <span className="text-sm font-medium text-gray-500 block mb-1">Source Trust:</span>
          <Badge color="purple">{routing.trustBadge}</Badge>
        </div>
      </div>

      <div className="flex gap-2">
        <Badge color="blue">Cost: {routing.costBadge}</Badge>
        <Badge color="blue">Speed: {routing.speedBadge}</Badge>
      </div>
    </div>
  );
}
