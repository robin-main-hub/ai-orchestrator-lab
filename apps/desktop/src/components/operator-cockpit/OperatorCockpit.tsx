import React, { useState } from 'react';
import { mockSnapshot } from './fixtures/mockSnapshot';
import { WorkerFleetCard } from './WorkerFleetCard';
import { ApprovalEvidenceCard } from './ApprovalEvidenceCard';
import { HandoffCard } from './HandoffCard';
import { MemoryRecallCard } from './MemoryRecallCard';
import { ProviderRoutingCard } from './ProviderRoutingCard';
import { RecoveryContinuityCard } from './RecoveryContinuityCard';
import { DispatchHistoryCard } from './DispatchHistoryCard';

const TABS = [
  'Conversation',
  'Debate',
  'Coding',
  'Tmux Workers',
  'Memory',
  'Recovery',
  'Provider Status'
];

export function OperatorCockpit() {
  const [snapshot] = useState(mockSnapshot);
  const [activeTab, setActiveTab] = useState('Tmux Workers');

  return (
    <div className="h-full min-h-0 bg-zinc-950 text-zinc-100 flex flex-col" data-focus-id="cockpit-container">
      {/* Top Navigation */}
      <div className="bg-white/5 backdrop-blur-md border-b border-white/10 px-6 flex items-center h-14 space-x-6">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`h-full px-2 text-sm font-medium border-b-2 transition-all duration-300 ${
              activeTab === tab
                ? 'border-cyan-400 text-cyan-400 drop-shadow-[0_0_8px_var(--color-cyan-400)]'
                : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:border-white/20'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Main Content Dashboard */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="mb-6 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-zinc-100 drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]">Operator Cockpit</h1>
          <span className="text-sm font-mono text-zinc-500 tracking-widest">LAST SYNC: {new Date(snapshot.timestamp).toLocaleTimeString()}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <div className="col-span-1 lg:col-span-2">
            <WorkerFleetCard fleet={snapshot.fleet} />
          </div>

          <div className="col-span-1 lg:col-span-2">
            <ApprovalEvidenceCard approvals={snapshot.approvals} />
          </div>

          <div className="col-span-1">
            <HandoffCard handoffs={snapshot.handoffs} />
          </div>

          <div className="col-span-1">
            <MemoryRecallCard memory={snapshot.memory} />
          </div>

          <div className="col-span-1">
            <ProviderRoutingCard routing={snapshot.routing} />
            <div className="mt-6">
              <RecoveryContinuityCard recovery={snapshot.recovery} />
            </div>
          </div>

          <div className="col-span-1 lg:col-span-2 xl:col-span-1">
            <DispatchHistoryCard history={snapshot.dispatchHistory} />
          </div>
        </div>
      </div>
    </div>
  );
}
