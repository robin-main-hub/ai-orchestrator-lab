import React from 'react';
import type { OperatorCockpitApprovalEvidence } from '@ai-orchestrator/protocol';
import { Badge } from './Badge';

export function ApprovalEvidenceCard({ approvals }: { approvals: OperatorCockpitApprovalEvidence[] }) {
  return (
    <div className="bg-white p-4 rounded shadow">
      <h3 className="text-lg font-semibold mb-4">Approval & Evidence</h3>
      {approvals.length === 0 ? (
        <p className="text-sm text-gray-500">No pending approvals.</p>
      ) : (
        <div className="space-y-4">
          {approvals.map((approval, idx) => (
            <div key={idx} className="flex flex-col gap-2 p-3 border rounded bg-yellow-50">
              <div className="flex justify-between items-start">
                <span className="font-semibold text-yellow-800">Review Required</span>
                <Badge color={approval.payloadBindingStatus === 'bound' ? 'green' : 'red'}>
                  Payload: {approval.payloadBindingStatus}
                </Badge>
              </div>
              <p className="text-sm font-medium text-gray-800">Reason: {approval.blockReason}</p>

              <div className="text-sm">
                <span className="font-semibold text-gray-700">Evidence:</span>
                <ul className="list-disc list-inside mt-1">
                  {approval.evidenceRefs.map((ev, i) => (
                    <li key={i} className="text-gray-600">
                      {ev.summary}
                    </li>
                  ))}
                </ul>
              </div>

              {approval.commandPreview && (
                <div className="mt-2">
                  <span className="text-sm font-semibold text-gray-700">Command Preview:</span>
                  <pre className="bg-gray-800 text-gray-100 p-2 rounded text-xs mt-1 overflow-x-auto">
                    {approval.commandPreview}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
