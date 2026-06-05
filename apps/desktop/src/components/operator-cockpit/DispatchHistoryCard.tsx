import React from 'react';
import type { OperatorCockpitDispatchHistory } from '@ai-orchestrator/protocol';
import { Badge } from './Badge';

export function DispatchHistoryCard({ history }: { history: OperatorCockpitDispatchHistory[] }) {
  return (
    <div className="bg-white p-4 rounded shadow">
      <h3 className="text-lg font-semibold mb-4">Dispatch History</h3>
      
      {history.length === 0 ? (
        <p className="text-sm text-gray-500">No dispatch history.</p>
      ) : (
        <div className="space-y-4">
          {history.map((dispatch) => (
            <div key={dispatch.dispatchId} className="p-3 border rounded text-sm">
              <div className="flex justify-between mb-2">
                <span className="font-medium text-gray-700">Requester: {dispatch.requesterAgentId}</span>
                <span className="text-gray-500">{new Date(dispatch.createdAt).toLocaleTimeString()}</span>
              </div>
              
              <div className="mb-2">
                <Badge color={dispatch.approvalState === 'approved' ? 'green' : dispatch.approvalState === 'rejected' ? 'red' : 'gray'}>
                  {dispatch.approvalState}
                </Badge>
              </div>

              <div className="bg-gray-100 p-2 rounded font-mono text-xs text-gray-600 truncate">
                {dispatch.replayPayloadDigest}
              </div>

              {dispatch.tamperWarning && (
                <div className="mt-2 text-red-600 font-bold bg-red-50 p-1 rounded">
                  ⚠️ TAMPER WARNING DETECTED
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
