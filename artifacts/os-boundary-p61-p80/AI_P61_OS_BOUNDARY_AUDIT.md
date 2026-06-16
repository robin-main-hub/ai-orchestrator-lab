# AI P61: OS Boundary Audit

## Objective
Identify any ERP, GIOLITE, customer, salesOrder, sampleRequest, quotation, domestic, export, buyer, or factory-specific terms embedded within the OS core.

## Audit Results
A strict audit of the OS codebase was conducted. We discovered that the OS core did indeed contain several ERP and GIOLITE specific hardcoded concepts, which violates the OS Boundary principle. The system should act as a generic AI orchestrator OS, not a GIOLITE-specific internal application.

### Identified Violations
- **packages/simplememo**: `batchRemember` and `evidenceBridge` files contain comments assuming the payload is "ERP/CRM evidence" and directly mentioning "ERP bridge" and "ERP DB".
- **packages/protocol**: The `customer_inquiry` and `customer_reply` tags are baked directly into the generic `ActionType` lists. Also, `workflowTemplate.ts` contains hardcoded `GIOLITE` business templates and `GIO` character directions.
- **apps/desktop**: Stage 9 Permission and Control Queue Presentation ledgers explicitly look for the term "customer" in summaries and map to `customer_reply`.
- **apps/server**: The `evidenceIngest.ts` module explicitly documents that it "Maps an EvidenceRef (from the ERP Evidence Hub)", assuming an ERP source.
- **apps/mobile**: `seeds.ts` contains hardcoded `GIO-WIKI v4` seed data.

### False Positives & Allowed Examples
- `EXCERPT` contains `ERP`.
- `USERPROFILE` contains `ERP`.
- Test assertions in `protocol` explicitly verifying the *absence* of "giolite", "견적", etc. are correctly behaving as boundary guards.

## Next Steps (Phase B & C)
We will immediately begin refactoring the identified violations.
- Remove all ERP-specific comments from `simplememo` and `apps/server/src/evidence`.
- Change `customer_reply` / `customer_inquiry` to a generic `external_reply` / `external_inquiry`.
- Remove GIOLITE references from generic `workflowTemplate.ts` and `apps/mobile/src/seeds.ts`.
- Re-align the Evidence Ingress generic contract.
