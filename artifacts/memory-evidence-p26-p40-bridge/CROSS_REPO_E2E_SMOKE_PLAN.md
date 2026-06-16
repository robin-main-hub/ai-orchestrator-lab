# Cross-Repo E2E Smoke Plan

## Objective
Validate the full end-to-end flow of signals generated in `example-erp-v1` being ingested by `ai-orchestrator-lab` memory and correctly surfaced during agent recalls.

## Steps

### Phase 1: Domain ERP Generation
1. Connect to DGX-02 `example-erp-v1` environment.
2. Trigger the evidence feed export script.
3. Validate the `evidence-memory-feed.json` artifact is populated with `not_erp_truth` items.

### Phase 2: AI Orchestrator Ingestion
1. Move the `evidence-memory-feed.json` into the `ai-orchestrator-lab` ingestion directory.
2. Run `pnpm start --ingest-evidence artifacts/evidence-memory-feed.json`.
3. Assert that `batchRemember` triggers without fatal exceptions.

### Phase 3: AI Recall and Learning
1. Start the AI Orchestrator runtime.
2. Send a user query to an active persona: "Any updates on TP-DOMESTIC price lists?"
3. Assert the agent retrieves `slack-105` context from `project_memory` and responds accordingly.

## Future Endpoint Bridge
The artifact bridge is temporary. The final architecture will implement an async web hook or direct REST API poll (`GET /api/evidence-hub/signals`) between the AI server and the ERP server.
