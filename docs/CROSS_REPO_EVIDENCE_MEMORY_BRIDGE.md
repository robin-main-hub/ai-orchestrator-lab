# Cross-Repo Evidence Memory Bridge

## Purpose
This document defines the REST payload contract and architecture for transferring aggregated non-ERP signals (Evidence) from the `gio-erp-v1` Evidence Hub to the `ai-orchestrator-lab` Memory/Learning Loop.

## Architecture
1. **Source (Sender)**: `gio-erp-v1`
   - Trigger: A cron job or an explicit user action via the Dashboard Cockpit.
   - Mechanism: Gathers unhandled top-priority signals from `/api/evidence-hub/signals`.
2. **Destination (Receiver)**: `ai-orchestrator-lab`
   - Endpoint: `POST /api/memory/ingest`
   - Mechanism: The `TrustEnforcedAdapter` applies `batchRemember` to transform the payload into vector memory packets.

## REST Payload Contract

**Endpoint:** `POST https://orchestrator.internal/api/memory/ingest`
**Headers:**
- `Authorization`: `Bearer <SERVICE_TOKEN>`
- `Content-Type`: `application/json`

**Payload Schema:**
```json
{
  "sourceSystem": "gio-erp",
  "batchId": "batch_12345",
  "timestamp": "2026-06-16T12:00:00Z",
  "evidenceCount": 2,
  "evidence": [
    {
      "id": "slack-105",
      "category": "quote",
      "severity": "high",
      "bpCode": "TP-DOMESTIC",
      "division": "DOMESTIC",
      "quoteSnippet": "태평양물산 TP price list",
      "certaintyLabel": "high_certainty",
      "actionType": "prepare_quote"
    },
    {
      "id": "email-201",
      "category": "payment",
      "severity": "medium",
      "bpCode": "RAJCO",
      "division": "EXPORT",
      "quoteSnippet": "Pradeep payment confirmation for invoice 123",
      "certaintyLabel": "medium_certainty",
      "actionType": "check_payment"
    }
  ]
}
```

## Security & Guardrails
- **Evidence Verification**: The ingest endpoint will discard packets that lack the `bpCode` or `sourceSystem` fields.
- **Truth Status**: Packets are marked as `truthStatus: "not_erp_truth"` internally within the memory loop until validated by an autonomous agent action that results in a DB mutation in the ERP.
