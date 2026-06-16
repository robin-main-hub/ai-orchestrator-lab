import { publishApprovedEvidence } from '../apps/server/src/evidence/evidenceIngest';
import { SimpleMemAdapter } from '../packages/simplememo/src/simpleMemAdapter';
import { TrustEnforcedAdapter } from '../packages/simplememo/src/trustEnforcedAdapter';
import { MementoAdapter } from '../packages/simplememo/src/mementoAdapter';

async function runSmoke() {
  const genericFeed = [
    {
      id: "evd_1",
      kind: "event",
      reference: "ticket-123",
      title: "Project Milestone Reached",
      summary: "The external team approved the phase 1 design.",
      contentHash: "hash123"
    },
    {
      id: "evd_2",
      kind: "message",
      reference: "support-456",
      title: "Client Feedback",
      summary: "Client requested minor adjustments to the dashboard layout.",
      contentHash: "hash456"
    }
  ];

  const baseAdapter = new SimpleMemAdapter();
  const memento = new MementoAdapter(baseAdapter);
  const adapter = new TrustEnforcedAdapter(memento);

  const mockIngested: any[] = [];
  
  adapter.batchRemember = async (memories, ctx, opts) => {
    mockIngested.push(...memories);
    return { async: false, records: memories.map(m => ({ id: "mem_" + Math.random(), ...m })) as any };
  };

  const ctx = {
    permissionDecision: "allow" as const,
    callerTrustLevel: "trusted" as const,
  };

  await publishApprovedEvidence(genericFeed as any, adapter, ctx);

  console.log('Generic evidence smoke test completed successfully.');
  console.log('Ingested records:', mockIngested.length);
}

runSmoke().catch(console.error);
