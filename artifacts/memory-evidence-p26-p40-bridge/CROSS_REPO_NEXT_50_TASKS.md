# Cross-Repo Next 50 Tasks

## Artifact to Endpoint Bridge
- [ ] Design async REST poll from `ai-orchestrator-lab` to `gio-erp-v1`
- [ ] Setup API token authentication between servers
- [ ] Implement incremental sync (fetch signals after last `generatedAt`)

## Idempotency & Replay
- [ ] Store processed `idempotencyKey` hashes in AI DB to skip duplicates
- [ ] Implement manual replay commands in GIO ERP to resend lost signals

## Redaction & Security
- [ ] Finalize regex rules for PII/pricing redaction
- [ ] Verify `trustBoundary: external_unverified` forces AI to prompt humans before acting

## Identity & Account Mapping
- [ ] Sync ERP Business Partner Codes (`bpCode`) with AI `accountKey`
- [ ] Map Slack thread authors to ERP Employee IDs

## UI & Dashboard Tracing
- [ ] AI desktop app: Add "Source: GIO Evidence Hub" link back to ERP dashboard
- [ ] ERP Dashboard: Show "AI Notified" badge on signals that have been ingested
