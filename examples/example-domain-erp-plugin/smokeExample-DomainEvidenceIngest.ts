import fs from 'fs';
import path from 'path';
import { publishApprovedEvidence } from '../../apps/server/src/evidence/evidenceIngest';
import { SimpleMemAdapter } from '../../packages/simplememo/src/simpleMemAdapter';
import { TrustEnforcedAdapter } from '../../packages/simplememo/src/trustEnforcedAdapter';
import { MementoAdapter } from '../../packages/simplememo/src/mementoAdapter';

async function runSmoke() {
  const feedPath = path.join(process.cwd(), 'artifacts/memory-evidence-p26-p40-bridge/sample-evidence-memory-feed.json');
  let feedItems = [];
  if (fs.existsSync(feedPath)) {
    const feedStr = fs.readFileSync(feedPath, 'utf8');
    feedItems = JSON.parse(feedStr).items || [];
  } else {
    feedItems = [
      {
        id: "gio_evd_1",
        kind: "message",
        reference: "domain-sales-101",
        title: "EXAMPLE_DOMAIN Quotation Request",
        summary: "Customer requested a price quote for 500 units of HTV."
      }
    ];
  }

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

  await publishApprovedEvidence(feedItems as any, adapter, ctx);

  console.log('EXAMPLE_DOMAIN ERP plugin smoke test completed successfully.');
  console.log('Ingested records:', mockIngested.length);
}

runSmoke().catch(console.error);
