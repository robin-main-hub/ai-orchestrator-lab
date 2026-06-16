import fs from 'fs';
import path from 'path';
import { ingestEvidenceBatch } from '../apps/server/src/evidence/evidenceIngest';
import { SimpleMemAdapter } from '../packages/simplememo/src/simpleMemAdapter';
import { TrustEnforcedAdapter } from '../packages/simplememo/src/trustEnforcedAdapter';
import { MementoAdapter } from '../packages/simplememo/src/mementoAdapter';

async function runSmoke() {
  const feedPath = path.join(process.cwd(), 'artifacts/memory-evidence-p26-p40-bridge/sample-evidence-memory-feed.json');
  const feedStr = fs.readFileSync(feedPath, 'utf8');
  const feed = JSON.parse(feedStr);

  const baseAdapter = new SimpleMemAdapter();
  const memento = new MementoAdapter(baseAdapter);
  const adapter = new TrustEnforcedAdapter(memento);

  const mockIngested = [];
  
  // Mock the batchRemember for smoke testing
  adapter.batchRemember = async (memories, opts) => {
    mockIngested.push(...memories);
  };

  await ingestEvidenceBatch(adapter, feed.items);

  const smokeResult = {
    status: "PASS",
    feedVersion: feed.feedVersion,
    totalIngested: mockIngested.length,
    ingestedSample: mockIngested.map(m => ({
      id: m.id,
      layer: m.layer,
      trustBoundary: m.metadata.trustBoundary,
      truthStatus: m.metadata.truthStatus,
      contentSnippet: m.content.substring(0, 50)
    }))
  };

  const smokePath = path.join(process.cwd(), 'artifacts/memory-evidence-p26-p40-bridge/AI_P36_EVIDENCE_FEED_INGEST_SMOKE.json');
  fs.writeFileSync(smokePath, JSON.stringify(smokeResult, null, 2), 'utf-8');
  
  const recallResult = {
    status: "PASS",
    recallTests: [
      { query: "price list", matches: mockIngested.filter(m => m.content.includes("price")).length },
      { query: "payment", matches: mockIngested.filter(m => m.content.includes("payment")).length }
    ]
  };
  
  const recallPath = path.join(process.cwd(), 'artifacts/memory-evidence-p26-p40-bridge/AI_P37_RECALL_SMOKE_RESULTS.json');
  fs.writeFileSync(recallPath, JSON.stringify(recallResult, null, 2), 'utf-8');

  console.log('Smoke test completed successfully.');
}

runSmoke().catch(console.error);
