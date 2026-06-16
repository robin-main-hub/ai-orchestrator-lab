# AI P35 Evidence Ingest Contract

## Evidence to Memory Mapping
This contract defines how `ai-orchestrator-lab` will map the JSON artifact exported from `gio-erp-v1` into native Memory objects for the AI Agent context.

### JSON Payload
```json
{
  "id": "slack-105",
  "idempotencyKey": "gio_ev_slack-105_2026-06-16T10:20:00.000Z",
  "accountKey": "TP-DOMESTIC",
  "category": "quote",
  "truthStatus": "not_erp_truth",
  "snippet": "태평양물산 TP price list",
  ...
}
```

### Transformation Logic
Upon ingest, `evidenceIngest.ts` parses the items and calls `batchRemember`:
```typescript
{
  id: payload.idempotencyKey,
  content: payload.snippet,
  metadata: {
    source: `evidence-hub:${payload.id}`,
    category: payload.category,
    accountKey: payload.accountKey,
    truthStatus: payload.truthStatus
  },
  layer: "project_memory",
  trustEnforced: true // Automatically applied by adapter for not_erp_truth flags
}
```

### Guarantees
1. No mutation of canonical ERP truth datasets.
2. Ingested memories are treated as context-hints (Evidence) rather than Facts.
3. Batch ingestion safely throttles or skips items with duplicate `idempotencyKey` strings.
