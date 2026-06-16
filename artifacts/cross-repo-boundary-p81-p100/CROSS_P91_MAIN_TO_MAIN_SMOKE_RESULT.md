# CROSS P91: Main-to-Main Smoke Result

## Scenario
Tested exporting Evidence Memory Feed from the `main` branch of Domain ERP and ingesting it into the `main` branch of AI Orchestrator OS using the generic evidence ingress pipeline.

## Result
**PASS**

## Observations
- `feedVersion`, `sourceSystem`, and `sourceModule` are present in the JSON root.
- All `items` cleanly parsed.
- `idempotencyKey` present and valid.
- `snippet` correctly capped (redaction active), and raw body removed.
- `trustBoundary`, `approvalStatus`, and `memoryLayer` properly supplied in the ingestion context.
- Successfully mapped generic payload to `EvidenceRef` / `MemoryCandidate` inside `mementoMcpAdapter` and dispatched via `batchRemember` to the central memory plane.
- Ingested Records: 2
