import React from 'react';
import type { OperatorCockpitHandoff } from '@ai-orchestrator/protocol';

export function HandoffCard({ handoffs }: { handoffs: OperatorCockpitHandoff[] }) {
  return (
    <div className="bg-white p-4 rounded shadow">
      <h3 className="text-lg font-semibold mb-4">Handoffs</h3>
      {handoffs.length === 0 ? (
        <p className="text-sm text-gray-500">No active handoffs.</p>
      ) : (
        <div className="space-y-4">
          {handoffs.map((handoff, idx) => (
            <div key={idx} className="p-3 border rounded">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-gray-500">Owner:</span>
                <span className="text-sm font-semibold">{handoff.ownerAgentId}</span>
              </div>
              <div className="mb-2">
                <span className="text-sm font-medium text-gray-500 block">Next Action:</span>
                <span className="text-sm text-gray-800">{handoff.nextAction}</span>
              </div>
              {handoff.missingInfoSlots.length > 0 && (
                <div>
                  <span className="text-sm font-medium text-gray-500 block">Missing Info:</span>
                  <ul className="list-disc list-inside mt-1">
                    {handoff.missingInfoSlots.map((slot, i) => (
                      <li key={i} className="text-sm text-red-600">
                        {slot.label} {slot.required && '(Required)'}
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
