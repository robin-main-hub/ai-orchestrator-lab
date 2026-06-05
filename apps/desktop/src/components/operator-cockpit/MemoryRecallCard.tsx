import React from 'react';
import type { OperatorCockpitMemoryRecall } from '@ai-orchestrator/protocol';
import { Badge } from './Badge';

export function MemoryRecallCard({ memory }: { memory: OperatorCockpitMemoryRecall }) {
  return (
    <div className="bg-white p-4 rounded shadow">
      <h3 className="text-lg font-semibold mb-4">Memory Recall</h3>

      <div className="mb-4">
        <span className="text-sm font-medium text-gray-500 block mb-1">Context Reasons:</span>
        <ul className="list-disc list-inside text-sm text-gray-700">
          {memory.contextReasons.map((reason, idx) => (
            <li key={idx}>{reason}</li>
          ))}
        </ul>
      </div>

      <div className="flex gap-4 mb-4">
        <div>
          <span className="text-sm font-medium text-gray-500 block mb-1">MacBook Authority</span>
          <Badge color={memory.macBookAuthorityEnabled ? 'green' : 'gray'}>
            {memory.macBookAuthorityEnabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </div>
        <div>
          <span className="text-sm font-medium text-gray-500 block mb-1">DGX Mirror Health</span>
          <Badge color={memory.dgxMirrorHealth === 'healthy' ? 'green' : memory.dgxMirrorHealth === 'degraded' ? 'yellow' : 'red'}>
            {memory.dgxMirrorHealth}
          </Badge>
        </div>
      </div>

      {memory.contradictionWarnings.length > 0 && (
        <div className="bg-red-50 p-3 rounded border border-red-200">
          <span className="text-sm font-semibold text-red-800 flex items-center gap-2 mb-1">
            ⚠️ Contradiction Warnings
          </span>
          <ul className="list-disc list-inside text-sm text-red-700">
            {memory.contradictionWarnings.map((warning, idx) => (
              <li key={idx}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
